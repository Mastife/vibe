import type {
  ProjectCreatePayload,
  ProjectDetailResponse,
  ProjectDto,
  ProjectUpdatePayload,
} from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { Prisma } from '../generated/prisma/client'
import { toHealthRunDto } from '../health/dto'
import { describePlan, monitorPlan } from '../health/target'
import { AppError } from '../http/errors'
import { mapPrismaError } from '../http/prisma-errors'
import { invoiceInclude, toInvoiceDto } from '../invoices/dto'
import { projectStatusNames, type JournalService } from '../journal/service'
import { addDays, parseDateOnly, parseDateOnlyOrNull, toIsoOrNull } from '../lib/dates'
import { decimalToNumber } from '../lib/money'
import { slugify, uniqueSlug } from '../lib/slug'
import { projectPilot } from './pilot'

const messages = {
  notFound: 'Проект не найден',
  relation: 'Указанный клиент или сервер не найден',
}

const slugConflict = () => new AppError(409, 'CONFLICT', 'Проект с таким slug уже существует')

export const projectInclude = {
  client: { select: { id: true, name: true } },
  server: { select: { id: true, name: true } },
} satisfies Prisma.ProjectInclude

export type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>

type UptimeStats = { uptime24h: number | null; uptime7d: number | null }
type OkCounts = { ok: number; total: number }

/** Health history kept on the detail screen: one day of five-minute checks. */
const detailHistoryLimit = 288

export class ProjectsService {
  constructor(
    private readonly db: DbClient,
    /** Optional so read-only consumers and unit tests can build the service without a journal. */
    private readonly journal?: JournalService,
  ) {}

  async list(now = new Date()): Promise<ProjectDto[]> {
    const rows = await this.db.project.findMany({ include: projectInclude, orderBy: { name: 'asc' } })
    const stats = await this.uptimeStats(
      rows.map((row) => row.id),
      now,
    )
    return rows.map((row) => toProjectDto(row, stats.get(row.id), now))
  }

  async get(id: string, now = new Date()): Promise<ProjectDto> {
    const row = await this.db.project.findUnique({ where: { id }, include: projectInclude })
    if (!row) throw new AppError(404, 'NOT_FOUND', messages.notFound)
    const stats = await this.uptimeStats([id], now)
    return toProjectDto(row, stats.get(id), now)
  }

  async getDetail(id: string, now = new Date()): Promise<ProjectDetailResponse> {
    const project = await this.get(id, now)
    const [runs, invoices] = await Promise.all([
      this.db.healthCheckRun.findMany({
        where: { projectId: id },
        orderBy: { checkedAt: 'desc' },
        take: detailHistoryLimit,
      }),
      this.db.invoice.findMany({
        where: { projectId: id },
        include: invoiceInclude,
        orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ])

    return {
      project,
      healthRuns: runs.map(toHealthRunDto),
      invoices: invoices.map((row) => toInvoiceDto(row, now)),
    }
  }

  async create(payload: ProjectCreatePayload, now = new Date()): Promise<ProjectDto> {
    assertAutoInvoiceReady(payload.autoInvoice, payload.clientId ?? null, payload.monthlyFee ?? null)
    const slug = await this.resolveSlug(payload.slug ?? null, payload.name)
    const row = await this.db.project
      .create({
        data: {
          name: payload.name,
          slug,
          description: payload.description ?? null,
          status: payload.status,
          repoUrl: payload.repoUrl ?? null,
          productionUrl: payload.productionUrl ?? null,
          healthCheckUrl: payload.healthCheckUrl ?? null,
          sshHost: payload.sshHost ?? null,
          dockerContainer: payload.dockerContainer ?? null,
          clientId: payload.clientId ?? null,
          serverId: payload.serverId ?? null,
          monthlyFee: payload.monthlyFee ?? null,
          currency: payload.currency,
          autoInvoice: payload.autoInvoice,
          billingDay: payload.billingDay,
          pilotStartsAt: payload.pilotStartsAt ? parseDateOnly(payload.pilotStartsAt) : null,
          pilotEndsAt: payload.pilotEndsAt ? parseDateOnly(payload.pilotEndsAt) : null,
          pilotOutcome: payload.pilotOutcome ?? null,
          tags: payload.tags,
          notes: payload.notes ?? null,
        },
        include: projectInclude,
      })
      .catch((error: unknown) => mapPrismaError(error, messages))

    await this.journal?.record(row.id, `Проект добавлен, статус «${projectStatusNames[row.status]}»`, now)
    return toProjectDto(row, undefined, now)
  }

  async update(id: string, payload: ProjectUpdatePayload, now = new Date()): Promise<ProjectDto> {
    if (payload.slug) {
      const existing = await this.db.project.findUnique({ where: { slug: payload.slug }, select: { id: true } })
      if (existing && existing.id !== id) throw slugConflict()
    }
    if (payload.autoInvoice || payload.clientId === null || payload.monthlyFee === null) {
      const current = await this.db.project.findUnique({
        where: { id },
        select: { autoInvoice: true, clientId: true, monthlyFee: true },
      })
      if (current) {
        assertAutoInvoiceReady(
          payload.autoInvoice ?? current.autoInvoice,
          payload.clientId === undefined ? current.clientId : payload.clientId,
          payload.monthlyFee === undefined ? decimalToNumber(current.monthlyFee, true) : payload.monthlyFee,
        )
      }
    }

    // The journal records what changed, so the previous values are read before the write.
    const before =
      this.journal && (payload.status !== undefined || payload.pilotOutcome !== undefined)
        ? await this.db.project.findUnique({ where: { id }, select: { status: true, pilotOutcome: true } })
        : null

    const row = await this.db.project
      .update({
        where: { id },
        data: {
          name: payload.name,
          slug: payload.slug ?? undefined,
          description: payload.description,
          status: payload.status,
          repoUrl: payload.repoUrl,
          productionUrl: payload.productionUrl,
          healthCheckUrl: payload.healthCheckUrl,
          sshHost: payload.sshHost,
          dockerContainer: payload.dockerContainer,
          clientId: payload.clientId,
          serverId: payload.serverId,
          monthlyFee: payload.monthlyFee,
          currency: payload.currency,
          autoInvoice: payload.autoInvoice,
          billingDay: payload.billingDay,
          pilotStartsAt: parseDateOnlyOrNull(payload.pilotStartsAt),
          pilotEndsAt: parseDateOnlyOrNull(payload.pilotEndsAt),
          pilotOutcome: payload.pilotOutcome,
          tags: payload.tags,
          notes: payload.notes,
        },
        include: projectInclude,
      })
      .catch((error: unknown) => mapPrismaError(error, messages))

    if (before && before.status !== row.status) {
      await this.journal?.record(
        id,
        `Статус: «${projectStatusNames[before.status]}» → «${projectStatusNames[row.status]}»`,
        now,
      )
    }
    if (before && before.pilotOutcome !== row.pilotOutcome && row.pilotOutcome) {
      const decision = row.pilotOutcome === 'CONTINUE' ? 'клиент продолжает' : 'клиент отказался'
      await this.journal?.record(id, `Пилот завершён: ${decision}`, now)
    }

    const stats = await this.uptimeStats([id], now)
    return toProjectDto(row, stats.get(id), now)
  }

  async remove(id: string): Promise<void> {
    await this.db.project.delete({ where: { id } }).catch((error: unknown) => mapPrismaError(error, messages))
  }

  private async resolveSlug(requested: string | null, name: string) {
    if (requested) {
      if (await this.slugTaken(requested)) throw slugConflict()
      return requested
    }

    return uniqueSlug(slugify(name), (candidate) => this.slugTaken(candidate))
  }

  private async slugTaken(slug: string) {
    return (await this.db.project.count({ where: { slug } })) > 0
  }

  private async uptimeStats(ids: string[], now: Date): Promise<Map<string, UptimeStats>> {
    if (ids.length === 0) return new Map()

    const [week, day] = await Promise.all([
      this.okCounts(ids, addDays(now, -7)),
      this.okCounts(ids, addDays(now, -1)),
    ])

    return new Map(
      ids.map((id) => [id, { uptime24h: uptimePercent(day.get(id)), uptime7d: uptimePercent(week.get(id)) }]),
    )
  }

  private async okCounts(ids: string[], since: Date): Promise<Map<string, OkCounts>> {
    const rows = await this.db.healthCheckRun.groupBy({
      by: ['projectId', 'ok'],
      where: { projectId: { in: ids }, checkedAt: { gte: since } },
      _count: { _all: true },
    })

    const counts = new Map<string, OkCounts>()
    for (const row of rows) {
      const entry = counts.get(row.projectId) ?? { ok: 0, total: 0 }
      entry.total += row._count._all
      if (row.ok) entry.ok += row._count._all
      counts.set(row.projectId, entry)
    }

    return counts
  }
}

function uptimePercent(counts: OkCounts | undefined): number | null {
  if (!counts || counts.total === 0) return null
  return Math.round((counts.ok / counts.total) * 1000) / 10
}

/** Auto-invoicing bills the project's client its monthly fee, so both must be present while it is on. */
function assertAutoInvoiceReady(autoInvoice: boolean | undefined, clientId: string | null, monthlyFee: number | null) {
  if (!autoInvoice) return
  if (!clientId || !monthlyFee) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Для автоматических счетов укажите клиента и ежемесячную плату')
  }
}

export function toProjectDto(row: ProjectRow, stats?: UptimeStats, now = new Date()): ProjectDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    repoUrl: row.repoUrl,
    productionUrl: row.productionUrl,
    healthCheckUrl: row.healthCheckUrl,
    sshHost: row.sshHost,
    dockerContainer: row.dockerContainer,
    monitorTarget: describePlan(monitorPlan(row)),
    clientId: row.clientId,
    serverId: row.serverId,
    client: row.client,
    server: row.server,
    monthlyFee: decimalToNumber(row.monthlyFee, true),
    currency: row.currency,
    autoInvoice: row.autoInvoice,
    billingDay: row.billingDay,
    pilot: projectPilot(row.pilotStartsAt, row.pilotEndsAt, row.pilotOutcome, now),
    tags: row.tags,
    notes: row.notes,
    health: {
      status: row.lastHealthStatus,
      checkedAt: toIsoOrNull(row.lastCheckedAt),
      latencyMs: row.lastLatencyMs,
      statusCode: row.lastStatusCode,
      error: row.lastError,
      sslExpiresAt: toIsoOrNull(row.sslExpiresAt),
      uptime24h: stats?.uptime24h ?? null,
      uptime7d: stats?.uptime7d ?? null,
    },
    repo: {
      pushedAt: toIsoOrNull(row.repoPushedAt),
      openIssues: row.repoOpenIssues,
      syncedAt: toIsoOrNull(row.repoSyncedAt),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
