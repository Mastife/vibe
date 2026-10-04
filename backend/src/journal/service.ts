import type {
  JournalEntryCreatePayload,
  JournalEntryDto,
  JournalEntryUpdatePayload,
  JournalListQuery,
  ProjectStatus,
} from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { Prisma } from '../generated/prisma/client'
import { AppError } from '../http/errors'
import { mapPrismaError } from '../http/prisma-errors'

const messages = {
  notFound: 'Запись журнала не найдена',
  relation: 'Указанный проект не найден',
}

/** The journal is a reading surface, not an archive export: the newest entries are what matter. */
const listLimit = 300

const entryInclude = {
  project: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.JournalEntryInclude

type EntryRow = Prisma.JournalEntryGetPayload<{ include: typeof entryInclude }>

export const projectStatusNames: Record<ProjectStatus, string> = {
  DEVELOPMENT: 'Разработка',
  ACTIVE: 'Активен',
  PAUSED: 'Пауза',
  ARCHIVED: 'Архив',
}

/** Room for the browser's clock running a little ahead of the server's. */
const clockSkewMs = 5 * 60 * 1000

/** A note records something that already happened, so its moment cannot be ahead of now. */
function notInFuture(happenedAt: string | undefined): Date | undefined {
  if (happenedAt === undefined) return undefined
  const moment = new Date(happenedAt)
  if (moment.getTime() > Date.now() + clockSkewMs) {
    throw new AppError(400, 'BAD_REQUEST', 'Запись не может быть датирована будущим')
  }
  return moment
}

export function toJournalEntryDto(row: EntryRow): JournalEntryDto {
  return {
    id: row.id,
    projectId: row.projectId,
    project: row.project,
    kind: row.kind,
    text: row.text,
    happenedAt: row.happenedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export class JournalService {
  constructor(private readonly db: DbClient) {}

  async list(query: JournalListQuery = {}): Promise<JournalEntryDto[]> {
    const rows = await this.db.journalEntry.findMany({
      where: { projectId: query.projectId },
      include: entryInclude,
      orderBy: [{ happenedAt: 'desc' }, { id: 'desc' }],
      take: listLimit,
    })
    return rows.map(toJournalEntryDto)
  }

  async create(payload: JournalEntryCreatePayload): Promise<JournalEntryDto> {
    const happenedAt = notInFuture(payload.happenedAt)
    const row = await this.db.journalEntry
      .create({ data: { projectId: payload.projectId, kind: 'NOTE', text: payload.text, happenedAt }, include: entryInclude })
      .catch((error: unknown) => mapPrismaError(error, messages))
    return toJournalEntryDto(row)
  }

  /** Only notes written by a person can be reworded; automatic events are a record of what happened. */
  async update(id: string, payload: JournalEntryUpdatePayload): Promise<JournalEntryDto> {
    const current = await this.db.journalEntry.findUnique({ where: { id }, select: { kind: true } })
    if (!current) throw new AppError(404, 'NOT_FOUND', messages.notFound)
    if (current.kind !== 'NOTE') {
      throw new AppError(400, 'BAD_REQUEST', 'Автоматические записи нельзя изменить, только удалить')
    }
    const happenedAt = notInFuture(payload.happenedAt)
    const row = await this.db.journalEntry
      .update({ where: { id }, data: { text: payload.text, happenedAt }, include: entryInclude })
      .catch((error: unknown) => mapPrismaError(error, messages))
    return toJournalEntryDto(row)
  }

  async remove(id: string): Promise<void> {
    await this.db.journalEntry.delete({ where: { id } }).catch((error: unknown) => mapPrismaError(error, messages))
  }

  /**
   * Records an automatic event. The journal is a side effect of the operation that calls this,
   * so a failed write is logged and never fails that operation.
   */
  async record(projectId: string, text: string, happenedAt = new Date()): Promise<void> {
    try {
      await this.db.journalEntry.create({ data: { projectId, kind: 'EVENT', text: text.slice(0, 4000), happenedAt } })
    } catch (error) {
      console.error(`Journal event for project ${projectId} was not recorded`, error)
    }
  }
}
