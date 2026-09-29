import { syncGithubRepos } from './github/sync'
import { DailyDigest } from './notifications/digest'
import { createBackendRuntime, type BackendRuntime } from './runtime'
import { createServices, type Services } from './services'

export type ScheduledTask = {
  name: string
  intervalMs: number
  run: () => Promise<unknown>
  runImmediately?: boolean
}

const dayMs = 24 * 60 * 60 * 1000
const hourMs = 60 * 60 * 1000

/** Telegram-facing jobs only run in the 12 hours after the digest hour, so nothing pings at night. */
export function isNotifyWindow(now: Date, digestHourUtc: number): boolean {
  return (now.getUTCHours() - digestHourUtc + 24) % 24 < 12
}

/** The background schedule: availability probes, GitHub activity, history pruning, the daily digest, billing, and payment reminders. */
export function workerTasks(runtime: BackendRuntime, services: Services): ScheduledTask[] {
  const env = runtime.env
  const digest = new DailyDigest(env.DAILY_DIGEST_HOUR_UTC, services.dashboardService, services.notifier, env.APP_URL)

  return [
    {
      name: 'health:check',
      intervalMs: env.HEALTH_CHECK_INTERVAL_SECONDS * 1000,
      run: () => services.healthService.checkAll(),
      runImmediately: true,
    },
    {
      name: 'github:sync',
      intervalMs: env.GITHUB_SYNC_INTERVAL_SECONDS * 1000,
      run: () => syncGithubRepos(runtime.prisma, env),
      runImmediately: true,
    },
    {
      name: 'health:prune',
      intervalMs: dayMs,
      run: () => services.healthService.pruneHistory(),
      runImmediately: true,
    },
    {
      name: 'digest:daily',
      intervalMs: 60 * 1000,
      run: () => digest.runIfDue(),
    },
    {
      name: 'domains:sync',
      intervalMs: dayMs,
      run: () => services.domainsService.syncExpiry(),
      runImmediately: true,
    },
    {
      name: 'billing:auto',
      intervalMs: hourMs,
      run: async () => (isNotifyWindow(new Date(), env.DAILY_DIGEST_HOUR_UTC) ? services.billingService.issueDue() : false),
      runImmediately: true,
    },
    {
      name: 'reminders:send',
      intervalMs: hourMs,
      run: async () => (isNotifyWindow(new Date(), env.DAILY_DIGEST_HOUR_UTC) ? services.remindersService.sendDue() : false),
      runImmediately: true,
    },
  ]
}

export async function runWorker(runtime: BackendRuntime, options: { services?: Services; signal?: AbortSignal } = {}) {
  const services = options.services ?? createServices(runtime)
  const signal = options.signal ?? new AbortController().signal
  const tasks = workerTasks(runtime, services)

  console.log(
    `Worker started: ${tasks.map((task) => `${task.name} every ${Math.round(task.intervalMs / 1000)}s`).join(', ')}`,
  )

  await Promise.all(tasks.map((task) => scheduleLoop(task, signal)))
}

/** Runs one task on its interval until the signal aborts; a failing run never stops the loop. */
export async function scheduleLoop(task: ScheduledTask, signal: AbortSignal) {
  if (task.runImmediately && !signal.aborted) {
    await runSafely(task)
  }

  while (!signal.aborted) {
    await sleep(task.intervalMs, signal)
    if (signal.aborted) break
    await runSafely(task)
  }
}

async function runSafely(task: ScheduledTask) {
  const startedAt = Date.now()
  try {
    const result = await task.run()
    const summary = result === undefined || result === false ? '' : ` ${JSON.stringify(result)}`
    console.log(`[worker] ${task.name} finished in ${Date.now() - startedAt}ms${summary}`)
  } catch (error) {
    console.error(`[worker] ${task.name} failed`, error)
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function main() {
  const runtime = createBackendRuntime()
  const controller = new AbortController()
  const stop = (signal: string) => {
    console.log(`Worker received ${signal}; stopping`)
    controller.abort()
  }
  process.on('SIGINT', () => stop('SIGINT'))
  process.on('SIGTERM', () => stop('SIGTERM'))

  try {
    await runWorker(runtime, { signal: controller.signal })
  } finally {
    await runtime.close()
  }
}

if (import.meta.main) {
  await main()
}
