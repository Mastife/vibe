import { describe, expect, test } from 'bun:test'
import type { DashboardResponse } from '@projects-hq/contracts'

import type { DashboardService } from '../dashboard/service'
import { DailyDigest, formatDigest } from './digest'

function dashboard(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    generatedAt: '2026-09-29T06:00:00.000Z',
    projects: { total: 3, active: 3, up: 2, down: 1, unknown: 0 },
    servers: { total: 1, active: 1, overdue: 0, dueSoon: 1, monthlyCost: [{ currency: 'RUB', amount: 1500 }] },
    invoices: { outstanding: [{ currency: 'RUB', amount: 45000 }], overdueCount: 1, dueSoonCount: 0, paidLast30Days: [] },
    alerts: [
      {
        id: 'a',
        severity: 'critical',
        kind: 'PROJECT_DOWN',
        title: 'Moika недоступен',
        description: 'HTTP 503',
        entityType: 'project',
        entityId: null,
        dueAt: null,
      },
      {
        id: 'b',
        severity: 'info',
        kind: 'PROJECTS_UNMONITORED',
        title: 'Без мониторинга: 2 проекта',
        description: '',
        entityType: 'projects',
        entityId: null,
        dueAt: null,
      },
    ],
    monitoredProjects: [],
    upcomingServerPayments: [],
    openInvoices: [],
    ...overrides,
  }
}

describe('formatDigest', () => {
  test('summarizes counts, receivables, and actionable alerts', () => {
    const text = formatDigest(dashboard(), 'https://hq.example.com')

    expect(text).toContain('Проекты: 2 работают, 1 недоступны')
    expect(text).toContain('К получению:')
    expect(text).toContain('🔴 Moika недоступен')
    expect(text).not.toContain('Без мониторинга')
    expect(text!.endsWith('https://hq.example.com')).toBe(true)
  })

  test('returns null when only informational monitoring hints remain', () => {
    const quiet = dashboard({ alerts: [dashboard().alerts[1]!] })
    expect(formatDigest(quiet)).toBeNull()
  })
})

describe('DailyDigest', () => {
  test('sends once per day at the configured hour', async () => {
    const sent: string[] = []
    const fakeDashboard = { build: async () => dashboard() } as unknown as DashboardService
    const digest = new DailyDigest(6, fakeDashboard, { send: async (text) => (sent.push(text), true) })

    expect(await digest.runIfDue(new Date('2026-09-29T05:59:00Z'))).toBe(false)
    expect(await digest.runIfDue(new Date('2026-09-29T06:05:00Z'))).toBe(true)
    expect(await digest.runIfDue(new Date('2026-09-29T06:30:00Z'))).toBe(false)
    expect(await digest.runIfDue(new Date('2026-09-30T06:00:00Z'))).toBe(true)
    expect(sent).toHaveLength(2)
  })

  test('does nothing without a notifier', async () => {
    const fakeDashboard = { build: async () => dashboard() } as unknown as DashboardService
    const digest = new DailyDigest(6, fakeDashboard, null)
    expect(await digest.send()).toBe(false)
  })
})
