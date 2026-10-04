import { z } from 'zod'

import { idSchema, isoDateSchema, isoDateTimeSchema, optionalDate, requiredText } from './common'
import { projectRefSchema } from './projects'

/** `NOTE` is written by a person; `EVENT` is recorded by the panel (status changes, outages, finished tasks). */
export const journalKindSchema = z.enum(['NOTE', 'EVENT'])

export const journalEntrySchema = z.object({
  id: idSchema,
  projectId: idSchema,
  project: projectRefSchema,
  kind: journalKindSchema,
  text: z.string(),
  happenedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export const journalEntryCreateSchema = z.object({
  projectId: idSchema,
  text: requiredText(4000),
  /** When it happened; omitted means now. The API refuses moments in the future. */
  happenedAt: isoDateTimeSchema.optional(),
})

export const journalEntryUpdateSchema = z.object({
  text: requiredText(4000),
  happenedAt: isoDateTimeSchema.optional(),
})

export const journalListQuerySchema = z.object({
  projectId: idSchema.optional(),
})

export const journalListResponseSchema = z.object({
  entries: z.array(journalEntrySchema),
})

export const journalEntryResponseSchema = z.object({
  entry: journalEntrySchema,
})

export const taskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'DONE'])

export const taskSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  project: projectRefSchema,
  title: z.string(),
  status: taskStatusSchema,
  dueAt: isoDateSchema.nullable(),
  doneAt: isoDateTimeSchema.nullable(),
  /** Days until the deadline; null without a deadline or once the task is done. */
  daysLeft: z.number().int().nullable(),
  isOverdue: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

const taskFieldsSchema = z.object({
  title: requiredText(300),
  dueAt: optionalDate(),
  status: taskStatusSchema,
})

export const taskCreateSchema = taskFieldsSchema.extend({
  projectId: idSchema,
  status: taskStatusSchema.default('TODO'),
})

// Defaults would silently reset fields on PATCH, so updates derive from the default-free base.
export const taskUpdateSchema = taskFieldsSchema.partial()

export const taskListQuerySchema = z.object({
  projectId: idSchema.optional(),
})

export const taskListResponseSchema = z.object({
  tasks: z.array(taskSchema),
})

export const taskResponseSchema = z.object({
  task: taskSchema,
})

export type JournalKind = z.infer<typeof journalKindSchema>
export type JournalEntryDto = z.infer<typeof journalEntrySchema>
export type JournalEntryCreatePayload = z.output<typeof journalEntryCreateSchema>
export type JournalEntryUpdatePayload = z.output<typeof journalEntryUpdateSchema>
export type JournalListQuery = z.infer<typeof journalListQuerySchema>
export type JournalListResponse = z.infer<typeof journalListResponseSchema>
export type JournalEntryResponse = z.infer<typeof journalEntryResponseSchema>
export type TaskStatus = z.infer<typeof taskStatusSchema>
export type TaskDto = z.infer<typeof taskSchema>
export type TaskCreateInput = z.input<typeof taskCreateSchema>
export type TaskCreatePayload = z.output<typeof taskCreateSchema>
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>
export type TaskUpdatePayload = z.output<typeof taskUpdateSchema>
export type TaskListQuery = z.infer<typeof taskListQuerySchema>
export type TaskListResponse = z.infer<typeof taskListResponseSchema>
export type TaskResponse = z.infer<typeof taskResponseSchema>
