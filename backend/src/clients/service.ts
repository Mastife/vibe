import type { ClientCreatePayload, ClientDto, ClientUpdatePayload, MoneyByCurrency } from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { Prisma } from '../generated/prisma/client'
import { AppError } from '../http/errors'
import { mapPrismaError } from '../http/prisma-errors'
import { decimalToNumber, sumByCurrency } from '../lib/money'

const messages = {
  notFound: 'Клиент не найден',
  restricted: 'Сначала удалите или переназначьте счета этого клиента',
}

const clientInclude = {
  _count: { select: { projects: true } },
} satisfies Prisma.ClientInclude

type ClientRow = Prisma.ClientGetPayload<{ include: typeof clientInclude }>

export class ClientsService {
  constructor(private readonly db: DbClient) {}

  async list(): Promise<ClientDto[]> {
    const rows = await this.db.client.findMany({ include: clientInclude, orderBy: { name: 'asc' } })
    const outstanding = await this.outstandingByClient(rows.map((row) => row.id))
    return rows.map((row) => toClientDto(row, outstanding.get(row.id) ?? []))
  }

  async get(id: string): Promise<ClientDto> {
    const row = await this.db.client.findUnique({ where: { id }, include: clientInclude })
    if (!row) throw new AppError(404, 'NOT_FOUND', messages.notFound)
    const outstanding = await this.outstandingByClient([id])
    return toClientDto(row, outstanding.get(id) ?? [])
  }

  async create(payload: ClientCreatePayload): Promise<ClientDto> {
    const row = await this.db.client.create({
      data: {
        name: payload.name,
        contactName: payload.contactName ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        telegram: payload.telegram ?? null,
        notes: payload.notes ?? null,
      },
      include: clientInclude,
    })
    return toClientDto(row, [])
  }

  async update(id: string, payload: ClientUpdatePayload): Promise<ClientDto> {
    const row = await this.db.client
      .update({
        where: { id },
        data: {
          name: payload.name,
          contactName: payload.contactName,
          email: payload.email,
          phone: payload.phone,
          telegram: payload.telegram,
          notes: payload.notes,
        },
        include: clientInclude,
      })
      .catch((error: unknown) => mapPrismaError(error, messages))
    const outstanding = await this.outstandingByClient([id])
    return toClientDto(row, outstanding.get(id) ?? [])
  }

  async remove(id: string): Promise<void> {
    await this.db.client.delete({ where: { id } }).catch((error: unknown) => mapPrismaError(error, messages))
  }

  private async outstandingByClient(ids: string[]): Promise<Map<string, MoneyByCurrency[]>> {
    if (ids.length === 0) return new Map()

    const rows = await this.db.invoice.groupBy({
      by: ['clientId', 'currency'],
      where: { clientId: { in: ids }, status: 'SENT' },
      _sum: { amount: true },
    })

    const perClient = new Map<string, Array<{ currency: string; amount: number }>>()
    for (const row of rows) {
      const list = perClient.get(row.clientId) ?? []
      list.push({ currency: row.currency, amount: decimalToNumber(row._sum.amount) })
      perClient.set(row.clientId, list)
    }

    return new Map([...perClient.entries()].map(([clientId, list]) => [clientId, sumByCurrency(list)]))
  }
}

function toClientDto(row: ClientRow, outstanding: MoneyByCurrency[]): ClientDto {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    telegram: row.telegram,
    notes: row.notes,
    projectCount: row._count.projects,
    outstanding,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
