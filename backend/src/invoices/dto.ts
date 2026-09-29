import type { InvoiceDto, InvoiceStatus } from '@projects-hq/contracts'

import type { Prisma } from '../generated/prisma/client'
import { toDateOnly, toDateOnlyOrNull, todayUtc } from '../lib/dates'
import { decimalToNumber } from '../lib/money'

export const invoiceInclude = {
  client: { select: { name: true } },
  project: { select: { name: true } },
} satisfies Prisma.InvoiceInclude

export type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>

export function isInvoiceOverdue(status: InvoiceStatus, dueAt: Date | null, now: Date): boolean {
  return status === 'SENT' && dueAt !== null && dueAt.getTime() < todayUtc(now).getTime()
}

export function toInvoiceDto(row: InvoiceRow, now: Date): InvoiceDto {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    title: row.title,
    amount: decimalToNumber(row.amount),
    currency: row.currency,
    status: row.status,
    issuedAt: toDateOnly(row.issuedAt),
    dueAt: toDateOnlyOrNull(row.dueAt),
    paidAt: toDateOnlyOrNull(row.paidAt),
    note: row.note,
    isOverdue: isInvoiceOverdue(row.status, row.dueAt, now),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
