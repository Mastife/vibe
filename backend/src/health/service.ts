import type { HealthCheckRunDto, HealthRunAllResponse, HealthStatus } from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { AppEnv } from '../env'
import { AppError } from '../http/errors'
import { addDays } from '../lib/dates'
import { escapeHtml, type Notifier } from '../notifications/telegram'
import { checkUrl, type HttpCheckResult } from './checker'
import { toHealthRunDto } from './dto'
import { nextHealthState } from './transition'

type MonitoredProject = {
  id: string
  name: string
  healthCheckUrl: string | null
  productionUrl: string | null
  lastHealthStatus: HealthStatus
  consecutiveFailures: number
}

const monitoredSelect = {
  id: true,
  name: true,
  healthCheckUrl: true,
  productionUrl: true,
  lastHealthStatus: true,
  consecutiveFailures: true,
} as const

const batchConcurrency = 5

/** The explicit health-check URL wins; otherwise the production URL is probed. */
export function monitoredUrl(project: Pick<MonitoredProject, 'healthCheckUrl' | 'productionUrl'>): string | null {
  return project.healthCheckUrl ?? project.productionUrl
}

export class HealthService {
  constructor(
    private readonly db: DbClient,
    private readonly env: Pick<
      AppEnv,
      'HEALTH_CHECK_TIMEOUT_MS' | 'HEALTH_HISTORY_RETENTION_DAYS' | 'HEALTH_DOWN_AFTER_FAILURES' | 'APP_URL'
    >,
    private readonly notifier: Notifier | null,
    private readonly check: typeof checkUrl = checkUrl,
  ) {}

  async checkProject(id: string): Promise<HealthCheckRunDto> {
    const project = await this.db.project.findUnique({ where: { id }, select: monitoredSelect })
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Проект не найден')

    const url = monitoredUrl(project)
    if (!url) {
      throw new AppError(
        400,
        'BAD_REQUEST',
        'У проекта нет адреса для проверки: заполните адрес продакшена или health-check URL',
      )
    }

    return this.runCheck(project, url)
  }

  async checkAll(): Promise<HealthRunAllResponse> {
    const projects = await this.db.project.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        OR: [{ healthCheckUrl: { not: null } }, { productionUrl: { not: null } }],
      },
      select: monitoredSelect,
      orderBy: { name: 'asc' },
    })

    const queue = [...projects]
    let up = 0
    let down = 0

    const workers = Array.from({ length: Math.min(batchConcurrency, queue.length) }, async () => {
      for (let project = queue.shift(); project; project = queue.shift()) {
        const url = monitoredUrl(project)
        if (!url) continue
        try {
          const run = await this.runCheck(project, url)
          if (run.ok) up += 1
          else down += 1
        } catch (error) {
          console.error(`Health check for ${project.name} failed`, error)
        }
      }
    })
    await Promise.all(workers)

    return { checked: projects.length, up, down }
  }

  async pruneHistory(now = new Date()): Promise<number> {
    const result = await this.db.healthCheckRun.deleteMany({
      where: { checkedAt: { lt: addDays(now, -this.env.HEALTH_HISTORY_RETENTION_DAYS) } },
    })
    return result.count
  }

  private async runCheck(project: MonitoredProject, url: string): Promise<HealthCheckRunDto> {
    const result = await this.check(url, { timeoutMs: this.env.HEALTH_CHECK_TIMEOUT_MS })
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

    await this.notifyTransition(project, url, next.status, result)

    return toHealthRunDto(run)
  }

  private async notifyTransition(
    project: MonitoredProject,
    url: string,
    nextStatus: HealthStatus,
    result: HttpCheckResult,
  ) {
    if (!this.notifier) return
    const previous = project.lastHealthStatus

    if (nextStatus === 'DOWN' && previous !== 'DOWN') {
      await this.notifier.send(
        [
          `🔴 <b>${escapeHtml(project.name)}</b> недоступен`,
          escapeHtml(result.error ?? 'Проверка не прошла'),
          escapeHtml(url),
          this.env.APP_URL ? `${this.env.APP_URL}/projects/${project.id}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      )
    } else if (nextStatus === 'UP' && previous === 'DOWN') {
      await this.notifier.send(
        `🟢 <b>${escapeHtml(project.name)}</b> снова работает (HTTP ${result.statusCode ?? '—'}, ${result.latencyMs} мс)`,
      )
    }
  }
}
