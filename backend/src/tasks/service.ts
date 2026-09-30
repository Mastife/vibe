import type { TaskCreatePayload, TaskDto, TaskListQuery, TaskStatus, TaskUpdatePayload } from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { Prisma } from '../generated/prisma/client'
import { AppError } from '../http/errors'
import { mapPrismaError } from '../http/prisma-errors'
import type { JournalService } from '../journal/service'
import { daysBetween, parseDateOnly, parseDateOnlyOrNull, toDateOnlyOrNull, toIsoOrNull, todayUtc } from '../lib/dates'

const messages = {
  notFound: 'Задача не найдена',
  relation: 'Указанный проект не найден',
}

const taskInclude = {
  project: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProjectTaskInclude

type TaskRow = Prisma.ProjectTaskGetPayload<{ include: typeof taskInclude }>

/** A finished task has no deadline pressure, whatever its date says. */
export function taskDue(
  dueAt: Date | null,
  status: TaskStatus,
  now: Date,
): { daysLeft: number | null; isOverdue: boolean } {
  if (!dueAt || status === 'DONE') return { daysLeft: null, isOverdue: false }
  const daysLeft = daysBetween(todayUtc(now), dueAt)
  return { daysLeft, isOverdue: daysLeft < 0 }
}

export function toTaskDto(row: TaskRow, now: Date): TaskDto {
  return {
    id: row.id,
    projectId: row.projectId,
    project: row.project,
    title: row.title,
    status: row.status,
    dueAt: toDateOnlyOrNull(row.dueAt),
    doneAt: toIsoOrNull(row.doneAt),
    ...taskDue(row.dueAt, row.status, now),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Open work first, nearest deadline on top; finished tasks follow, most recently closed first. */
export function compareTasks(a: TaskDto, b: TaskDto): number {
  const aDone = a.status === 'DONE'
  const bDone = b.status === 'DONE'
  if (aDone !== bDone) return aDone ? 1 : -1
  if (aDone) return (b.doneAt ?? '').localeCompare(a.doneAt ?? '')
  if (a.dueAt !== b.dueAt) {
    if (!a.dueAt) return 1
    if (!b.dueAt) return -1
    return a.dueAt.localeCompare(b.dueAt)
  }
  return a.createdAt.localeCompare(b.createdAt)
}

export class TasksService {
  constructor(
    private readonly db: DbClient,
    private readonly journal: JournalService,
  ) {}

  async list(query: TaskListQuery = {}, now = new Date()): Promise<TaskDto[]> {
    const rows = await this.db.projectTask.findMany({ where: { projectId: query.projectId }, include: taskInclude })
    return rows.map((row) => toTaskDto(row, now)).sort(compareTasks)
  }

  async create(payload: TaskCreatePayload, now = new Date()): Promise<TaskDto> {
    const row = await this.db.projectTask
      .create({
        data: {
          projectId: payload.projectId,
          title: payload.title,
          status: payload.status,
          dueAt: payload.dueAt ? parseDateOnly(payload.dueAt) : null,
          doneAt: payload.status === 'DONE' ? now : null,
        },
        include: taskInclude,
      })
      .catch((error: unknown) => mapPrismaError(error, messages))
    return toTaskDto(row, now)
  }

  async update(id: string, payload: TaskUpdatePayload, now = new Date()): Promise<TaskDto> {
    const current = await this.db.projectTask.findUnique({ where: { id }, select: { status: true } })
    if (!current) throw new AppError(404, 'NOT_FOUND', messages.notFound)
    const finished = payload.status === 'DONE' && current.status !== 'DONE'
    const reopened = payload.status !== undefined && payload.status !== 'DONE' && current.status === 'DONE'

    const row = await this.db.projectTask
      .update({
        where: { id },
        data: {
          title: payload.title,
          status: payload.status,
          dueAt: parseDateOnlyOrNull(payload.dueAt),
          doneAt: finished ? now : reopened ? null : undefined,
        },
        include: taskInclude,
      })
      .catch((error: unknown) => mapPrismaError(error, messages))

    if (finished) await this.journal.record(row.projectId, `Задача выполнена: ${row.title}`, now)
    return toTaskDto(row, now)
  }

  async remove(id: string): Promise<void> {
    await this.db.projectTask.delete({ where: { id } }).catch((error: unknown) => mapPrismaError(error, messages))
  }
}
