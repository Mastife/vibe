import type {
  InvoiceCreatePayload,
  InvoiceDto,
  InvoiceListQuery,
  InvoiceUpdatePayload,
} from '@projects-hq/contracts'

import type { DbClient } from '../db'
import { AppError } from '../http/errors'
import { mapPrismaError } from '../http/prisma-errors'
import { parseDateOnly, parseDateOnlyOrNull, todayUtc } from '../lib/dates'
import { invoiceInclude, toInvoiceDto } from './dto'

const messages = {
  notFound: 'Счёт не найден',
  relation: 'Указанный клиент или проект не найден',
}

export class InvoicesService {
  constructor(private readonly db: DbClient) {}

  async list(query: InvoiceListQuery = {}, now = new Date()): Promise<InvoiceDto[]> {
    const rows = await this.db.invoice.findMany({
      where: {
        status: query.status,
        clientId: query.clientId,
        projectId: query.projectId,
      },
      include: invoiceInclude,
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { issuedAt: 'desc' }, { createdAt: 'desc' }],
    })

    return rows.map((row) => toInvoiceDto(row, now))
  }

  async get(id: string, now = new Date()): Promise<InvoiceDto> {
    const row = await this.db.invoice.findUnique({ where: { id }, include: invoiceInclude })
    if (!row) throw new AppError(404, 'NOT_FOUND', messages.notFound)
    return toInvoiceDto(row, now)
  }

  async create(payload: InvoiceCreatePayload, now = new Date()): Promise<InvoiceDto> {
    const today = todayUtc(now)
    const paidAt = payload.paidAt ? parseDateOnly(payload.paidAt) : payload.status === 'PAID' ? today : null

    const row = await this.db.invoice
      .create({
        data: {
          clientId: payload.clientId,
          projectId: payload.projectId ?? null,
          title: payload.title,
          amount: payload.amount,
          currency: payload.currency,
          status: payload.status,
          issuedAt: payload.issuedAt ? parseDateOnly(payload.issuedAt) : today,
          dueAt: payload.dueAt ? parseDateOnly(payload.dueAt) : null,
          paidAt,
          note: payload.note ?? null,
        },
        include: invoiceInclude,
      })
      .catch((error: unknown) => mapPrismaError(error, messages))

    return toInvoiceDto(row, now)
  }

  async update(id: string, payload: InvoiceUpdatePayload, now = new Date()): Promise<InvoiceDto> {
    const current = await this.db.invoice.findUnique({ where: { id }, select: { status: true, paidAt: true } })
    if (!current) throw new AppError(404, 'NOT_FOUND', messages.notFound)

    const nextStatus = payload.status ?? current.status
    let paidAt = parseDateOnlyOrNull(payload.paidAt)
    // Marking as paid stamps today unless a date was given; leaving the paid state clears the stamp.
    if (nextStatus === 'PAID' && paidAt === undefined && current.paidAt === null) {
      paidAt = todayUtc(now)
    } else if (nextStatus !== 'PAID' && payload.status !== undefined && paidAt === undefined) {
      paidAt = null
    }

    const row = await this.db.invoice
      .update({
        where: { id },
        data: {
          clientId: payload.clientId,
          projectId: payload.projectId,
          title: payload.title,
          amount: payload.amount,
          currency: payload.currency,
          status: payload.status,
          issuedAt: payload.issuedAt ? parseDateOnly(payload.issuedAt) : undefined,
          dueAt: parseDateOnlyOrNull(payload.dueAt),
          paidAt,
          note: payload.note,
        },
        include: invoiceInclude,
      })
      .catch((error: unknown) => mapPrismaError(error, messages))

    return toInvoiceDto(row, now)
  }

  async remove(id: string): Promise<void> {
    await this.db.invoice.delete({ where: { id } }).catch((error: unknown) => mapPrismaError(error, messages))
  }
}
