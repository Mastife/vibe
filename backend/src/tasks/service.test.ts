import { describe, expect, test } from 'bun:test'
import type { TaskDto } from '@projects-hq/contracts'

import { collectReminders, formatReminders } from '../notifications/reminders'
import { compareTasks, taskDue } from './service'

const now = new Date('2026-09-30T08:00:00Z')
const iso = now.toISOString()

function task(overrides: Partial<TaskDto> & { id: string; title: string }): TaskDto {
  return {
    projectId: 'p1',
    project: { id: 'p1', name: 'Moika', slug: 'moika' },
    status: 'TODO',
    dueAt: null,
    doneAt: null,
    daysLeft: null,
    isOverdue: false,
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  }
}

describe('task deadlines', () => {
  test('counts days to the deadline and flags it only once the day has passed', () => {
    expect(taskDue(new Date('2026-10-02'), 'TODO', now)).toEqual({ daysLeft: 2, isOverdue: false })
    expect(taskDue(new Date('2026-09-30'), 'IN_PROGRESS', now)).toEqual({ daysLeft: 0, isOverdue: false })
    expect(taskDue(new Date('2026-09-29'), 'TODO', now)).toEqual({ daysLeft: -1, isOverdue: true })
  })

  test('a finished or undated task carries no deadline pressure', () => {
    expect(taskDue(new Date('2026-09-01'), 'DONE', now)).toEqual({ daysLeft: null, isOverdue: false })
    expect(taskDue(null, 'TODO', now)).toEqual({ daysLeft: null, isOverdue: false })
  })

  test('orders open tasks by deadline, undated ones last, then finished ones by completion', () => {
    const tasks = [
      task({ id: '1', title: 'done-old', status: 'DONE', doneAt: '2026-09-20T10:00:00.000Z' }),
      task({ id: '2', title: 'undated' }),
      task({ id: '3', title: 'later', dueAt: '2026-10-10' }),
      task({ id: '4', title: 'done-new', status: 'DONE', doneAt: '2026-09-29T10:00:00.000Z' }),
      task({ id: '5', title: 'soon', dueAt: '2026-10-01', status: 'IN_PROGRESS' }),
    ]
    expect(tasks.sort(compareTasks).map((item) => item.title)).toEqual(['soon', 'later', 'undated', 'done-new', 'done-old'])
  })
})

describe('task reminders', () => {
  test('remind the day before, on the day, and once overdue; never for finished or undated tasks', () => {
    const candidates = collectReminders({
      servers: [],
      domains: [],
      invoices: [],
      tasks: [
        task({ id: 'far', title: 'Через неделю', dueAt: '2026-10-07' }),
        task({ id: 'tomorrow', title: 'Отчёт', dueAt: '2026-10-01' }),
        task({ id: 'today', title: 'Созвон', dueAt: '2026-09-30' }),
        task({ id: 'late', title: 'Бэкап', dueAt: '2026-09-27' }),
        task({ id: 'done', title: 'Готово', dueAt: '2026-09-27', status: 'DONE' }),
        task({ id: 'undated', title: 'Когда-нибудь' }),
      ],
      now,
    })
    expect(candidates.map((candidate) => [candidate.entityId, candidate.threshold])).toEqual([
      ['late', -1],
      ['today', 0],
      ['tomorrow', 1],
    ])

    const text = formatReminders(candidates)
    expect(text).toContain('⚠️ Задача «Бэкап» (Moika): просрочена на 3 дня (срок 27 сентября)')
    expect(text).toContain('✅ Задача «Созвон» (Moika): срок сегодня')
    expect(text).toContain('✅ Задача «Отчёт» (Moika): срок через 1 день, 1 октября')
  })
})
