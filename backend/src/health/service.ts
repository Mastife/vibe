import type { HealthCheckRunDto, HealthRunAllResponse, HealthStatus } from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { AppEnv } from '../env'
import { AppError } from '../http/errors'
import { addDays } from '../lib/dates'
import type { Notifier } from '../notifications/telegram'
import { checkUrl } from './checker'
import { checkDockerOverSsh } from './docker-checker'
import { toHealthRunDto } from './dto'
import { formatTransitions, type HealthTransition } from './notify'
import { combineResults, describePlan, monitorPlan, type MonitorPlan } from './target'
import { nextHealthState } from './transition'

type MonitoredProject = {
  id: string
  name: string
  healthCheckUrl: string | null
  productionUrl: string | null
  sshHost: string | null
  dockerContainer: string | null
  lastHealthStatus: HealthStatus
  consecutiveFailures: number
}

const monitoredSelect = {
  id: true,
  name: true,
  healthCheckUrl: true,
  productionUrl: true,
  sshHost: true,
  dockerContainer: true,
  lastHealthStatus: true,
  consecutiveFailures: true,
} as const

const batchConcurrency = 5


export class HealthService {
  constructor(
    private readonly db: DbClient,
    private readonly env: Pick<
      AppEnv,
      'HEALTH_CHECK_TIMEOUT_MS' | 'HEALTH_HISTORY_RETENTION_DAYS' | 'HEALTH_DOWN_AFTER_FAILURES' | 'APP_URL'
    >,
    private readonly notifier: Notifier | null,
    private readonly check: typeof checkUrl = checkUrl,
    private readonly checkDocker: typeof checkDockerOverSsh = checkDockerOverSsh,
  ) {}

  async checkProject(id: string): Promise<HealthCheckRunDto> {
    const project = await this.db.project.findUnique({ where: { id }, select: monitoredSelect })
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Проект не найден')

    const plan = monitorPlan(project)
    if (!plan) {
      throw new AppError(
        400,
        'BAD_REQUEST',
        'Проекту нечего проверять: заполните адрес продакшена, health-check URL или Docker-контейнер по SSH',
      )
    }

    const { run, transition } = await this.runCheck(project, plan)
    await this.sendTransitions(transition ? [transition] : [])
    return run
  }

  async checkAll(): Promise<HealthRunAllResponse> {
    const projects = await this.db.project.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        OR: [
          { healthCheckUrl: { not: null } },
          { productionUrl: { not: null } },
          { sshHost: { not: null }, dockerContainer: { not: null } },
        ],
      },
      select: monitoredSelect,
      orderBy: { name: 'asc' },
    })

    const queue = [...projects]
    let up = 0
    let down = 0
    const transitions: HealthTransition[] = []

    const workers = Array.from({ length: Math.min(batchConcurrency, queue.length) }, async () => {
      for (let project = queue.shift(); project; project = queue.shift()) {
        const plan = monitorPlan(project)
        if (!plan) continue
        try {
          const { run, transition } = await this.runCheck(project, plan)
          if (run.ok) up += 1
          else down += 1
          if (transition) transitions.push(transition)
        } catch (error) {
          console.error(`Health check for ${project.name} failed`, error)
        }
      }
    })
    await Promise.all(workers)
    // Sent after the whole batch so one incident across several projects becomes one message.
    await this.sendTransitions(transitions)

    return { checked: projects.length, up, down }
  }

  async pruneHistory(now = new Date()): Promise<number> {
    const result = await this.db.healthCheckRun.deleteMany({
      where: { checkedAt: { lt: addDays(now, -this.env.HEALTH_HISTORY_RETENTION_DAYS) } },
    })
    return result.count
  }

  private async runCheck(
    project: MonitoredProject,
    plan: MonitorPlan,
  ): Promise<{ run: HealthCheckRunDto; transition: HealthTransition | null }> {
    const timeoutMs = this.env.HEALTH_CHECK_TIMEOUT_MS
    const [web, container] = await Promise.all([
      plan.url ? this.check(plan.url, { timeoutMs }) : null,
      plan.docker ? this.checkDocker(plan.docker.sshHost, plan.docker.container, { timeoutMs }) : null,
    ])
    const result = combineResults(web, container)
    const next = nextHealthState(
      { status: project.lastHealthStatus, consecutiveFailures: project.consecutiveFailures },
      result.ok,
      this.env.HEALTH_DOWN_AFTER_FAILURES,
    )
    const checkedAt = new Date()

    const [run] = await this.db.$transaction([
      this.db.healthCheckRun.create({
        data: {
          projectId: project.id,
          checkedAt,
          ok: result.ok,
          statusCode: result.statusCode,
          latencyMs: result.latencyMs,
          error: result.error,
          sslExpiresAt: result.sslExpiresAt,
        },
      }),
      this.db.project.update({
        where: { id: project.id },
        data: {
          lastHealthStatus: next.status,
          consecutiveFailures: next.consecutiveFailures,
          lastCheckedAt: checkedAt,
          lastLatencyMs: result.latencyMs,
          lastStatusCode: result.statusCode,
          lastError: result.error,
          // A failed handshake must not erase the last known certificate date.
          sslExpiresAt: result.sslExpiresAt ?? undefined,
        },
      }),
    ])

    const previous = project.lastHealthStatus
    const transition: HealthTransition | null =
      next.status === 'DOWN' && previous !== 'DOWN'
        ? {
            kind: 'down',
            projectId: project.id,
            name: project.name,
            error: result.error ?? 'Проверка не прошла',
            target: describePlan(plan) ?? '',
          }
        : next.status === 'UP' && previous === 'DOWN'
          ? { kind: 'up', projectId: project.id, name: project.name, statusCode: result.statusCode, latencyMs: result.latencyMs }
          : null

    return { run: toHealthRunDto(run), transition }
  }

  private async sendTransitions(transitions: HealthTransition[]) {
    if (!this.notifier) return
    for (const text of formatTransitions(transitions, this.env.APP_URL ?? undefined)) {
      await this.notifier.send(text)
    }
  }
}
