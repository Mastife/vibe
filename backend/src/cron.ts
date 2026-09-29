import { syncGithubRepos } from './github/sync'
import { DailyDigest } from './notifications/digest'
import { createBackendRuntime, type BackendRuntime } from './runtime'
import { createServices } from './services'

type CronTask = (runtime: BackendRuntime) => Promise<void>

const cronTasks = {
  noop: async () => {
    console.log('Cron noop task completed.')
  },
  'db:ping': async ({ prisma }) => {
    await prisma.$queryRaw`SELECT 1`
    console.log('Cron db:ping task completed.')
  },
  'health:check': async (runtime) => {
    const result = await createServices(runtime).healthService.checkAll()
    console.log(`Cron health:check: ${result.checked} checked, ${result.up} up, ${result.down} down.`)
  },
  'health:prune': async (runtime) => {
    const removed = await createServices(runtime).healthService.pruneHistory()
    console.log(`Cron health:prune: removed ${removed} old health runs.`)
  },
  'github:sync': async (runtime) => {
    const result = await syncGithubRepos(runtime.prisma, runtime.env)
    console.log(`Cron github:sync: ${result.synced} synced, ${result.skipped} skipped, ${result.failed} failed.`)
  },
  'digest:daily': async (runtime) => {
    const services = createServices(runtime)
    const digest = new DailyDigest(
      runtime.env.DAILY_DIGEST_HOUR_UTC,
      services.dashboardService,
      services.notifier,
      runtime.env.APP_URL,
    )
    const sent = await digest.send()
    console.log(sent ? 'Cron digest:daily: digest sent.' : 'Cron digest:daily: nothing to send or Telegram is not configured.')
  },
  'domains:sync': async (runtime) => {
    const result = await createServices(runtime).domainsService.syncExpiry()
    console.log(`Cron domains:sync: ${result.checked} checked, ${result.updated} updated, ${result.failed} failed.`)
  },
  'billing:auto': async (runtime) => {
    const result = await createServices(runtime).billingService.issueDue()
    console.log(`Cron billing:auto: ${result.issued} invoices issued.`)
  },
  'reminders:send': async (runtime) => {
    const result = await createServices(runtime).remindersService.sendDue()
    console.log(`Cron reminders:send: ${result.sent} reminders sent.`)
  },
} satisfies Record<string, CronTask>

export type CronTaskName = keyof typeof cronTasks

export async function runCronTask(taskName: string, runtime: BackendRuntime) {
  const task = cronTasks[taskName as CronTaskName]

  if (!task) {
    throw new Error(`Unknown cron task "${taskName}". Available tasks: ${Object.keys(cronTasks).join(', ')}`)
  }

  await task(runtime)
}

export async function main(argv: string[] = Bun.argv.slice(2)) {
  const [taskName] = argv

  if (!taskName) {
    console.error(`Cron task name is required. Available tasks: ${Object.keys(cronTasks).join(', ')}`)
    process.exit(1)
  }

  const runtime = createBackendRuntime()

  try {
    await runCronTask(taskName, runtime)
  } finally {
    await runtime.close()
  }
}

if (import.meta.main) {
  await main()
}
