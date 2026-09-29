import { describe, expect, test } from 'bun:test'
import type { InvoiceDto, ProjectDto, ServerDto } from '@projects-hq/contracts'

import { buildAnalytics, type AnalyticsInput } from './analytics'

const now = new Date('2026-09-29T12:00:00Z')
const iso = now.toISOString()

function project(overrides: Partial<ProjectDto> & { id: string; name: string }): ProjectDto {
  return {
    slug: overrides.id,
    description: null,
    status: 'ACTIVE',
    repoUrl: null,
    productionUrl: 'https://example.com',
    healthCheckUrl: null,
    clientId: null,
    serverId: null,
    client: null,
    server: null,
    monthlyFee: null,
    autoInvoice: false,
    billingDay: 1,
    pilot: { startsAt: null, endsAt: null, outcome: null, state: 'NONE', daysLeft: null },
    currency: 'KZT',
    tags: [],
    notes: null,
    health: {
      status: 'UP',
      checkedAt: iso,
      latencyMs: 100,
      statusCode: 200,
      error: null,
      sslExpiresAt: null,
      uptime24h: 100,
      uptime7d: 100,
    },
    repo: { pushedAt: null, openIssues: null, syncedAt: null },
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  }
}

function server(overrides: Partial<ServerDto> & { id: string; name: string }): ServerDto {
  return {
    provider: null,
    host: null,
    location: null,
    specs: null,
    panelUrl: null,
    monthlyCost: 3750,
    currency: 'KZT',
    billingPeriod: 'MONTHLY',
    paidUntil: '2026-10-19',
    status: 'ACTIVE',
    notes: null,
    projects: [],
    payment: { state: 'OK', daysLeft: 20 },
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  }
}

function invoice(overrides: Partial<InvoiceDto> & { id: string; amount: number }): InvoiceDto {
  return {
    clientId: 'c1',
    clientName: 'BROFOOD',
    projectId: null,
    projectName: null,
    title: 'Поддержка',
    currency: 'KZT',
    status: 'SENT',
    issuedAt: '2026-09-01',
    dueAt: '2026-09-15',
    paidAt: null,
    note: null,
    isOverdue: false,
    autoPeriod: null,
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  }
}

function input(overrides: Partial<AnalyticsInput> = {}): AnalyticsInput {
  return {
    now,
    projects: [],
    servers: [],
    openInvoices: [],
    dailyHealth: [],
    paidInvoices: [],
    serverPayments: [],
    ...overrides,
  }
}

describe('buildAnalytics health', () => {
  test('aggregates daily uptime and latency for monitored, non-archived projects only', () => {
    const result = buildAnalytics(
      input({
        projects: [
          project({ id: 'a', name: 'Artemis', monthlyFee: 50000 }),
          project({ id: 'b', name: 'Bonustar', health: { ...project({ id: 'x', name: 'x' }).health, status: 'DOWN' } }),
          project({ id: 'z', name: 'Old', status: 'ARCHIVED' }),
          project({ id: 'n', name: 'No URL', productionUrl: null }),
        ],
        dailyHealth: [
          { projectId: 'a', day: new Date('2026-09-29T00:00:00Z'), total: 10, ok: 10, latencySum: 1000, latencyCount: 10 },
          { projectId: 'b', day: new Date('2026-09-29T00:00:00Z'), total: 10, ok: 5, latencySum: 1500, latencyCount: 5 },
          { projectId: 'z', day: new Date('2026-09-29T00:00:00Z'), total: 10, ok: 0, latencySum: null, latencyCount: 0 },
        ],
      }),
    )

    expect(result.currency).toBe('KZT')
    expect(result.health.days).toHaveLength(14)
    expect(result.health.days.at(-1)).toBe('2026-09-29')
    expect(result.health.daily.at(-1)).toEqual({ date: '2026-09-29', uptime: 75, checks: 20, failures: 5 })
    expect(result.health.daily[0]!.uptime).toBeNull()
    expect(result.health.uptime7d).toBe(75)
    expect(result.health.avgLatencyMs).toBe(167)
    expect(result.health.statusCounts).toEqual({ up: 1, down: 1, unknown: 0 })
    expect(result.health.projects.map((row) => row.id)).toEqual(['a', 'b'])
    expect(result.health.projects[1]).toMatchObject({ id: 'b', avgLatencyMs: 300 })
    expect(result.health.projects[1]!.daily.at(-1)).toBe(50)
    expect(result.health.lifecycle).toEqual([
      { status: 'ACTIVE', count: 3 },
      { status: 'DEVELOPMENT', count: 0 },
      { status: 'PAUSED', count: 0 },
      { status: 'ARCHIVED', count: 1 },
    ])
    expect(result.finance.monthlyRevenue).toBe(50000)
  })

  test('reports SSL days left from the certificate expiry', () => {
    const base = project({ id: 'a', name: 'A' })
    const result = buildAnalytics(
      input({ projects: [{ ...base, health: { ...base.health, sslExpiresAt: '2026-10-09T12:00:00.000Z' } }] }),
    )
    expect(result.health.projects[0]!.sslDaysLeft).toBe(10)
  })
})

describe('buildAnalytics finance', () => {
  test('sums active tenge servers and skips decommissioned, free, and foreign-currency ones', () => {
    const result = buildAnalytics(
      input({
        servers: [
          server({ id: 's1', name: 'NaviGo', monthlyCost: 7300, paidUntil: '2026-11-01' }),
          server({ id: 's2', name: 'Yearly', monthlyCost: 12000, billingPeriod: 'YEARLY', paidUntil: '2027-03-01' }),
          server({ id: 's3', name: 'Old', status: 'DECOMMISSIONED' }),
          server({ id: 's4', name: 'Client-paid', monthlyCost: 0, paidUntil: null }),
          server({ id: 's5', name: 'Dollar', currency: 'USD' }),
        ],
      }),
    )

    expect(result.finance.monthlyCost).toBe(8300)
    expect(result.finance.servers.map((row) => [row.id, row.monthlyCost])).toEqual([
      ['s1', 7300],
      ['s2', 1000],
    ])
  })

  test('walks renewals forward over six months and folds overdue ones into the current month', () => {
    const result = buildAnalytics(
      input({
        servers: [
          server({ id: 's1', name: 'G-service', monthlyCost: 3750, paidUntil: '2026-10-19' }),
          server({ id: 's2', name: 'Overdue', monthlyCost: 1000, paidUntil: '2026-09-20' }),
        ],
      }),
    )

    expect(result.finance.forecast.map((row) => row.month)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ])
    expect(result.finance.forecast[0]).toEqual({ month: '2026-09', serverPayments: 1000, renewals: 1 })
    expect(result.finance.forecast[1]).toEqual({ month: '2026-10', serverPayments: 4750, renewals: 2 })
    expect(result.finance.forecast[5]).toEqual({ month: '2027-02', serverPayments: 4750, renewals: 2 })
  })

  test('buckets income and expenses by month for the last twelve months', () => {
    const result = buildAnalytics(
      input({
        paidInvoices: [
          { amount: 45000, currency: 'KZT', paidAt: new Date('2026-09-10T00:00:00Z') },
          { amount: 100, currency: 'USD', paidAt: new Date('2026-09-10T00:00:00Z') },
        ],
        serverPayments: [{ amount: 7300, currency: 'KZT', paidAt: new Date('2026-08-01T00:00:00Z') }],
      }),
    )

    expect(result.finance.months).toHaveLength(12)
    expect(result.finance.months[0]!.month).toBe('2025-10')
    expect(result.finance.months.at(-1)).toEqual({ month: '2026-09', income: 45000, expenses: 0 })
    expect(result.finance.months.at(-2)).toEqual({ month: '2026-08', income: 0, expenses: 7300 })
  })

  test('splits open invoices per client into overdue and current', () => {
    const result = buildAnalytics(
      input({
        openInvoices: [
          invoice({ id: 'i1', amount: 45000, isOverdue: true }),
          invoice({ id: 'i2', amount: 15000 }),
          invoice({ id: 'i3', amount: 90000, clientId: 'c2', clientName: 'Artemis' }),
        ],
      }),
    )

    expect(result.finance.outstanding).toBe(150000)
    expect(result.finance.overdue).toBe(45000)
    expect(result.finance.clientDebts).toEqual([
      { clientId: 'c2', name: 'Artemis', overdue: 0, current: 90000 },
      { clientId: 'c1', name: 'BROFOOD', overdue: 45000, current: 15000 },
    ])
  })
})
