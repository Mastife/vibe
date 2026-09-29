import type {
  PaymentState,
  ServerCreatePayload,
  ServerDetailResponse,
  ServerDto,
  ServerPaymentCreatePayload,
  ServerPaymentDto,
  ServerUpdatePayload,
} from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { Prisma } from '../generated/prisma/client'
import { AppError } from '../http/errors'
import { mapPrismaError } from '../http/prisma-errors'
import {
  addBillingPeriods,
  daysBetween,
  parseDateOnly,
  parseDateOnlyOrNull,
  toDateOnly,
  toDateOnlyOrNull,
  todayUtc,
} from '../lib/dates'
import { decimalToNumber } from '../lib/money'

const messages = {
  notFound: 'Сервер не найден',
}

/** Servers whose paid period ends within this many days show up as "due soon". */
export const serverDueSoonDays = 7

export const serverInclude = {
  projects: { select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } },
} satisfies Prisma.ServerInclude

export type ServerRow = Prisma.ServerGetPayload<{ include: typeof serverInclude }>
type ServerPaymentRow = Awaited<ReturnType<DbClient['serverPayment']['findMany']>>[number]

export function paymentState(paidUntil: Date | null, now: Date): { state: PaymentState; daysLeft: number | null } {
  if (!paidUntil) return { state: 'UNKNOWN', daysLeft: null }
  const daysLeft = daysBetween(todayUtc(now), paidUntil)
  if (daysLeft < 0) return { state: 'OVERDUE', daysLeft }
  if (daysLeft <= serverDueSoonDays) return { state: 'DUE_SOON', daysLeft }
  return { state: 'OK', daysLeft }
}

export class ServersService {
  constructor(private readonly db: DbClient) {}

  async list(now = new Date()): Promise<ServerDto[]> {
    const rows = await this.db.server.findMany({
      include: serverInclude,
      orderBy: [{ paidUntil: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    })
    return rows.map((row) => toServerDto(row, now))
  }

  async get(id: string, now = new Date()): Promise<ServerDto> {
    const row = await this.db.server.findUnique({ where: { id }, include: serverInclude })
    if (!row) throw new AppError(404, 'NOT_FOUND', messages.notFound)
    return toServerDto(row, now)
  }

  async getDetail(id: string, now = new Date()): Promise<ServerDetailResponse> {
    const server = await this.get(id, now)
    const payments = await this.db.serverPayment.findMany({
      where: { serverId: id },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    })
    return { server, payments: payments.map(toServerPaymentDto) }
  }

  async create(payload: ServerCreatePayload, now = new Date()): Promise<ServerDto> {
    const row = await this.db.server.create({
      data: {
        name: payload.name,
        provider: payload.provider ?? null,
        host: payload.host ?? null,
        location: payload.location ?? null,
        specs: payload.specs ?? null,
        panelUrl: payload.panelUrl ?? null,
        monthlyCost: payload.monthlyCost,
        currency: payload.currency,
        billingPeriod: payload.billingPeriod,
        paidUntil: payload.paidUntil ? parseDateOnly(payload.paidUntil) : null,
        status: payload.status,
        notes: payload.notes ?? null,
      },
      include: serverInclude,
    })
    return toServerDto(row, now)
  }

  async update(id: string, payload: ServerUpdatePayload, now = new Date()): Promise<ServerDto> {
    const row = await this.db.server
      .update({
        where: { id },
        data: {
          name: payload.name,
          provider: payload.provider,
          host: payload.host,
          location: payload.location,
          specs: payload.specs,
          panelUrl: payload.panelUrl,
          monthlyCost: payload.monthlyCost,
          currency: payload.currency,
          billingPeriod: payload.billingPeriod,
          paidUntil: parseDateOnlyOrNull(payload.paidUntil),
          status: payload.status,
          notes: payload.notes,
        },
        include: serverInclude,
      })
      .catch((error: unknown) => mapPrismaError(error, messages))
    return toServerDto(row, now)
  }

  async remove(id: string): Promise<void> {
    await this.db.server.delete({ where: { id } }).catch((error: unknown) => mapPrismaError(error, messages))
  }

  /** Logs a payment and pushes `paidUntil` forward from the later of the current paid period or the payment date. */
  async recordPayment(id: string, payload: ServerPaymentCreatePayload, now = new Date()): Promise<ServerDetailResponse> {
    await this.db.$transaction(async (tx) => {
      const server = await tx.server.findUnique({ where: { id } })
      if (!server) throw new AppError(404, 'NOT_FOUND', messages.notFound)

      const paidAt = parseDateOnly(payload.paidAt)
      const periodStart =
        server.paidUntil && server.paidUntil.getTime() >= paidAt.getTime() ? server.paidUntil : paidAt
      const periodEnd = addBillingPeriods(periodStart, server.billingPeriod, payload.periods)

      await tx.serverPayment.create({
        data: {
          serverId: id,
          amount: payload.amount,
          currency: payload.currency ?? server.currency,
          paidAt,
          periodStart,
          periodEnd,
          note: payload.note ?? null,
        },
      })
      await tx.server.update({ where: { id }, data: { paidUntil: periodEnd } })
    })

    return this.getDetail(id, now)
  }

  /** Removes a logged payment and recomputes `paidUntil` from the remaining history. */
  async removePayment(serverId: string, paymentId: string, now = new Date()): Promise<ServerDetailResponse> {
    await this.db.$transaction(async (tx) => {
      const deleted = await tx.serverPayment.deleteMany({ where: { id: paymentId, serverId } })
      if (deleted.count === 0) throw new AppError(404, 'NOT_FOUND', 'Платёж не найден')

      const latest = await tx.serverPayment.findFirst({ where: { serverId }, orderBy: { periodEnd: 'desc' } })
      await tx.server
        .update({ where: { id: serverId }, data: { paidUntil: latest?.periodEnd ?? null } })
        .catch((error: unknown) => mapPrismaError(error, messages))
    })

    return this.getDetail(serverId, now)
  }
}

export function toServerDto(row: ServerRow, now: Date): ServerDto {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    host: row.host,
    location: row.location,
    specs: row.specs,
    panelUrl: row.panelUrl,
    monthlyCost: decimalToNumber(row.monthlyCost),
    currency: row.currency,
    billingPeriod: row.billingPeriod,
    paidUntil: toDateOnlyOrNull(row.paidUntil),
    status: row.status,
    notes: row.notes,
    projects: row.projects,
    payment: paymentState(row.paidUntil, now),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toServerPaymentDto(row: ServerPaymentRow): ServerPaymentDto {
  return {
    id: row.id,
    serverId: row.serverId,
    amount: decimalToNumber(row.amount),
    currency: row.currency,
    paidAt: toDateOnly(row.paidAt),
    periodStart: toDateOnly(row.periodStart),
    periodEnd: toDateOnly(row.periodEnd),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }
}
