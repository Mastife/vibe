import { connect } from 'node:net'

import type {
  DomainCreatePayload,
  DomainDto,
  DomainSyncResponse,
  DomainUpdatePayload,
  PaymentState,
} from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { Prisma } from '../generated/prisma/client'
import { AppError } from '../http/errors'
import { mapPrismaError } from '../http/prisma-errors'
import { daysBetween, parseDateOnly, parseDateOnlyOrNull, toDateOnlyOrNull, toIsoOrNull, todayUtc } from '../lib/dates'
import type { FetchLike } from '../lib/fetch'
import { decimalToNumber } from '../lib/money'

const messages = {
  notFound: 'Домен не найден',
  relation: 'Указанный проект не найден',
}

/** Domains are renewed yearly, so the warning window is wider than for servers. */
export const domainDueSoonDays = 30

const domainInclude = {
  project: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.DomainInclude

type DomainRow = Prisma.DomainGetPayload<{ include: typeof domainInclude }>

export function renewalState(expiresAt: Date | null, now: Date): { state: PaymentState; daysLeft: number | null } {
  if (!expiresAt) return { state: 'UNKNOWN', daysLeft: null }
  const daysLeft = daysBetween(todayUtc(now), expiresAt)
  if (daysLeft < 0) return { state: 'OVERDUE', daysLeft }
  if (daysLeft <= domainDueSoonDays) return { state: 'DUE_SOON', daysLeft }
  return { state: 'OK', daysLeft }
}

export function toDomainDto(row: DomainRow, now: Date): DomainDto {
  return {
    id: row.id,
    name: row.name,
    registrar: row.registrar,
    projectId: row.projectId,
    project: row.project,
    expiresAt: toDateOnlyOrNull(row.expiresAt),
    renewalCost: decimalToNumber(row.renewalCost),
    currency: row.currency,
    notes: row.notes,
    expirySyncedAt: toIsoOrNull(row.expirySyncedAt),
    renewal: renewalState(row.expiresAt, now),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export type RdapResult = { expiresAt: Date | null; registrar: string | null }

type RdapEntity = { roles?: string[]; vcardArray?: [string, Array<[string, unknown, string, unknown]>] }
type RdapDomain = { events?: Array<{ eventAction?: string; eventDate?: string }>; entities?: RdapEntity[] }

/** Looks the domain up via the public RDAP bootstrap; returns null when the TLD has no RDAP service. */
export async function lookupRdap(name: string, fetchImpl: FetchLike = fetch): Promise<RdapResult | null> {
  const response = await fetchImpl(`https://rdap.org/domain/${encodeURIComponent(name)}`, {
    headers: { Accept: 'application/rdap+json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`RDAP HTTP ${response.status}`)

  const body = (await response.json()) as RdapDomain
  const expiration = body.events?.find((event) => event.eventAction === 'expiration')?.eventDate
  const registrarEntity = body.entities?.find((entity) => entity.roles?.includes('registrar'))
  const registrarName = registrarEntity?.vcardArray?.[1]?.find((entry) => entry[0] === 'fn')?.[3]

  return {
    expiresAt: expiration ? todayUtc(new Date(expiration)) : null,
    registrar: typeof registrarName === 'string' ? registrarName : null,
  }
}

/**
 * .kz has no RDAP and its WHOIS shows only the registration date. Domains there renew yearly,
 * so the next anniversary of the registration is the best available estimate of the expiry.
 */
export function parseKzWhois(text: string, now: Date): RdapResult | null {
  const created = text.match(/Domain created\.*:\s*(\d{4}-\d{2}-\d{2})/)?.[1]
  if (!created) return null
  const registrar = text.match(/Current Registrar\.*:\s*(.+)/)?.[1]?.trim() || null
  const today = todayUtc(now)
  const createdAt = parseDateOnly(created)
  let years = 1
  let expiresAt = addYears(createdAt, years)
  while (expiresAt < today) expiresAt = addYears(createdAt, ++years)
  return { expiresAt, registrar }
}

function addYears(date: Date, years: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()))
}

export type WhoisQuery = (server: string, query: string) => Promise<string>

export const queryWhois: WhoisQuery = (server, query) =>
  new Promise((resolve, reject) => {
    let output = ''
    const socket = connect(43, server, () => socket.write(`${query}\r\n`))
    socket.setEncoding('utf8')
    socket.setTimeout(10_000, () => socket.destroy(new Error('WHOIS timeout')))
    socket.on('data', (chunk) => (output += chunk))
    socket.on('end', () => resolve(output))
    socket.on('error', reject)
  })

export class DomainsService {
  constructor(
    private readonly db: DbClient,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly whois: WhoisQuery = queryWhois,
    private readonly rdapSpacingMs = 1500,
  ) {}

  async list(now = new Date()): Promise<DomainDto[]> {
    const rows = await this.db.domain.findMany({
      include: domainInclude,
      orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    })
    return rows.map((row) => toDomainDto(row, now))
  }

  async create(payload: DomainCreatePayload, now = new Date()): Promise<DomainDto> {
    const row = await this.db.domain
      .create({
        data: {
          name: payload.name,
          registrar: payload.registrar ?? null,
          projectId: payload.projectId ?? null,
          expiresAt: payload.expiresAt ? parseDateOnly(payload.expiresAt) : null,
          renewalCost: payload.renewalCost,
          currency: payload.currency,
          notes: payload.notes ?? null,
        },
        include: domainInclude,
      })
      .catch((error: unknown) => mapPrismaError(error, messages))
    return toDomainDto(row, now)
  }

  async update(id: string, payload: DomainUpdatePayload, now = new Date()): Promise<DomainDto> {
    const row = await this.db.domain
      .update({
        where: { id },
        data: {
          name: payload.name,
          registrar: payload.registrar,
          projectId: payload.projectId,
          expiresAt: parseDateOnlyOrNull(payload.expiresAt),
          renewalCost: payload.renewalCost,
          currency: payload.currency,
          notes: payload.notes,
        },
        include: domainInclude,
      })
      .catch((error: unknown) => mapPrismaError(error, messages))
    return toDomainDto(row, now)
  }

  async remove(id: string): Promise<void> {
    await this.db.domain.delete({ where: { id } }).catch((error: unknown) => mapPrismaError(error, messages))
  }

  async get(id: string, now = new Date()): Promise<DomainDto> {
    const row = await this.db.domain.findUnique({ where: { id }, include: domainInclude })
    if (!row) throw new AppError(404, 'NOT_FOUND', messages.notFound)
    return toDomainDto(row, now)
  }

  /**
   * Refreshes expiry dates (and a missing registrar) from RDAP, which is authoritative. For .kz only
   * an estimate exists, so it fills an empty or already-passed date and never overrides a manual one.
   */
  async syncExpiry(now = new Date()): Promise<DomainSyncResponse> {
    const today = todayUtc(now)
    const rows = await this.db.domain.findMany({ select: { id: true, name: true, registrar: true, expiresAt: true } })
    let updated = 0
    let failed = 0
    let rdapCalls = 0

    for (const row of rows) {
      try {
        let result: RdapResult | null
        if (row.name.endsWith('.kz')) {
          const estimate = parseKzWhois(await this.whois('whois.nic.kz', row.name), now)
          const replaceable = !row.expiresAt || row.expiresAt < today
          result = estimate && { expiresAt: replaceable ? estimate.expiresAt : null, registrar: estimate.registrar }
        } else {
          // rdap.org rate-limits bursts; a daily job can afford to be polite.
          if (rdapCalls++ > 0) await new Promise((resolve) => setTimeout(resolve, this.rdapSpacingMs))
          result = await lookupRdap(row.name, this.fetchImpl)
        }
        if (!result) continue
        if (!result.expiresAt) {
          if (result.registrar && !row.registrar) {
            await this.db.domain.update({ where: { id: row.id }, data: { registrar: result.registrar } })
          }
          continue
        }
        await this.db.domain.update({
          where: { id: row.id },
          data: {
            expiresAt: result.expiresAt,
            registrar: row.registrar ?? result.registrar,
            expirySyncedAt: now,
          },
        })
        updated += 1
      } catch (error) {
        failed += 1
        console.error(`Expiry lookup failed for ${row.name}`, error)
      }
    }

    return { checked: rows.length, updated, failed }
  }
}
