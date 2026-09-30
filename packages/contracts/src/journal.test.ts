import { describe, expect, test } from 'bun:test'

import { journalEntryCreateSchema, taskCreateSchema, taskUpdateSchema } from './index'

const projectId = '019990a0-0000-7000-8000-000000000001'

describe('journal contracts', () => {
  test('a note needs a project and non-blank text', () => {
    expect(journalEntryCreateSchema.parse({ projectId, text: '  Созвон  ' })).toEqual({ projectId, text: 'Созвон' })
    expect(journalEntryCreateSchema.safeParse({ projectId, text: '   ' }).success).toBe(false)
    expect(journalEntryCreateSchema.safeParse({ text: 'Созвон' }).success).toBe(false)
  })
})

describe('task contracts', () => {
  test('a new task starts as TODO and takes an optional deadline from form input', () => {
    expect(taskCreateSchema.parse({ projectId, title: 'Отчёт', dueAt: '' })).toEqual({
      projectId,
      title: 'Отчёт',
      dueAt: null,
      status: 'TODO',
    })
    expect(taskCreateSchema.parse({ projectId, title: 'Отчёт', dueAt: '2026-10-01' }).dueAt).toBe('2026-10-01')
    expect(taskCreateSchema.safeParse({ projectId, title: 'Отчёт', dueAt: '01.10.2026' }).success).toBe(false)
  })

  test('an update changes only what is sent and can clear the deadline', () => {
    expect(taskUpdateSchema.parse({ status: 'DONE' })).toEqual({ status: 'DONE' })
    expect(taskUpdateSchema.parse({ dueAt: '' })).toEqual({ dueAt: null })
    expect(taskUpdateSchema.safeParse({ status: 'LATER' }).success).toBe(false)
    expect(taskUpdateSchema.safeParse({ title: ' ' }).success).toBe(false)
  })
})
