import type {
  ProjectCreatePayload,
  ProjectDetailResponse,
  ProjectDto,
  ProjectUpdatePayload,
} from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { Prisma } from '../generated/prisma/client'
import { toHealthRunDto } from '../health/dto'
import { AppError } from '../http/errors'
import { mapPrismaError } from '../http/prisma-errors'
import { invoiceInclude, toInvoiceDto } from '../invoices/dto'
import { addDays, toIsoOrNull } from '../lib/dates'
import { decimalToNumber } from '../lib/money'
import { slugify, uniqueSlug } from '../lib/slug'

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
  constructor(private readonly db: DbClient) {}

  async list(now = new Date()): Promise<ProjectDto[]> {
    const rows = await this.db.project.findMany({ include: projectInclude, orderBy: { name: 'asc' } })
    const stats = await this.uptimeStats(
      rows.map((row) => row.id),
      now,
    )
    return rows.map((row) => toProjectDto(row, stats.get(row.id)))
  }

  async get(id: string, now = new Date()): Promise<ProjectDto> {
    const row = await this.db.project.findUnique({ where: { id }, include: projectInclude })
    if (!row) throw new AppError(404, 'NOT_FOUND', messages.notFound)
    const stats = await this.uptimeStats([id], now)
    return toProjectDto(row, stats.get(id))
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

  async create(payload: ProjectCreatePayload): Promise<ProjectDto> {
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
          clientId: payload.clientId ?? null,
          serverId: payload.serverId ?? null,
          monthlyFee: payload.monthlyFee ?? null,
          currency: payload.currency,
          tags: payload.tags,
          notes: payload.notes ?? null,
        },
        include: projectInclude,
      })
      .catch((error: unknown) => mapPrismaError(error, messages))

    return toProjectDto(row)
  }

  async update(id: string, payload: ProjectUpdatePayload, now = new Date()): Promise<ProjectDto> {
    if (payload.slug) {
      const existing = await this.db.project.findUnique({ where: { slug: payload.slug }, select: { id: true } })
      if (existing && existing.id !== id) throw slugConflict()
    }

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
          clientId: payload.clientId,
          serverId: payload.serverId,
          monthlyFee: payload.monthlyFee,
          currency: payload.currency,
          tags: payload.tags,
          notes: payload.notes,
        },
        include: projectInclude,
      })
      .catch((error: unknown) => mapPrismaError(error, messages))

    const stats = await this.uptimeStats([id], now)
    return toProjectDto(row, stats.get(id))
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

export function toProjectDto(row: ProjectRow, stats?: UptimeStats): ProjectDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    repoUrl: row.repoUrl,
    productionUrl: row.productionUrl,
    healthCheckUrl: row.healthCheckUrl,
    clientId: row.clientId,
    serverId: row.serverId,
    client: row.client,
    server: row.server,
    monthlyFee: decimalToNumber(row.monthlyFee, true),
    currency: row.currency,
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
