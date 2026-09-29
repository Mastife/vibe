import { describe, expect, test } from 'bun:test'
import type { InvoiceDto, ProjectDto, ServerDto } from '@projects-hq/contracts'

import { buildAlerts } from './alerts'

const now = new Date('2026-09-29T12:00:00Z')

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
    pilot: { startsAt: null, endsAt: null, outcome: null, state: 'NONE', daysLeft: null, blocksInvoicing: false },
    currency: 'RUB',
    tags: [],
    notes: null,
    health: {
      status: 'UP',
      checkedAt: now.toISOString(),
      latencyMs: 100,
      statusCode: 200,
      error: null,
      sslExpiresAt: null,
      uptime24h: 100,
      uptime7d: 100,
    },
    repo: { pushedAt: null, openIssues: null, syncedAt: null },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  }
}

function server(overrides: Partial<ServerDto> & { id: string; name: string; paidUntil: string | null }): ServerDto {
  const daysLeft = overrides.paidUntil
    ? Math.round((Date.parse(overrides.paidUntil) - Date.parse('2026-09-29')) / 86_400_000)
    : null
  return {
    provider: null,
    host: null,
    location: null,
    specs: null,
    panelUrl: null,
    monthlyCost: 1500,
    currency: 'RUB',
    billingPeriod: 'MONTHLY',
    status: 'ACTIVE',
    notes: null,
    projects: [],
    payment: { state: daysLeft === null ? 'UNKNOWN' : daysLeft < 0 ? 'OVERDUE' : daysLeft <= 7 ? 'DUE_SOON' : 'OK', daysLeft },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  }
}

function invoice(overrides: Partial<InvoiceDto> & { id: string; title: string; dueAt: string | null }): InvoiceDto {
  return {
    clientId: 'c1',
    clientName: 'ООО Ромашка',
    projectId: null,
    projectName: null,
    amount: 45000,
    currency: 'RUB',
    status: 'SENT',
    issuedAt: '2026-09-01',
    paidAt: null,
    note: null,
    isOverdue: overrides.dueAt !== null && overrides.dueAt! < '2026-09-29',
    autoPeriod: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  }
}

describe('buildAlerts', () => {
  test('flags down projects, expiring certificates, and unmonitored projects', () => {
    const alerts = buildAlerts({
      now,
      servers: [],
      openInvoices: [],
      projects: [
        project({ id: 'p1', name: 'Moika', health: { ...project({ id: 'x', name: 'x' }).health, status: 'DOWN', error: 'HTTP 503' } }),
        project({
          id: 'p2',
          name: 'Gifty',
          health: { ...project({ id: 'x', name: 'x' }).health, sslExpiresAt: '2026-10-05T00:00:00Z' },
        }),
        project({ id: 'p3', name: 'Handi', productionUrl: null }),
        project({ id: 'p4', name: 'Old', productionUrl: null, status: 'ARCHIVED' }),
      ],
    })

    expect(alerts.map((alert) => alert.kind)).toEqual(['PROJECT_DOWN', 'SSL_EXPIRING', 'PROJECTS_UNMONITORED'])
    expect(alerts[0]).toMatchObject({ severity: 'critical', title: 'Moika недоступен', description: 'HTTP 503' })
    expect(alerts[1]).toMatchObject({ severity: 'warning', dueAt: '2026-10-05' })
    expect(alerts[1]!.title).toContain('через 6 дней')
    expect(alerts[2]).toMatchObject({ severity: 'info', title: 'Без мониторинга: 1 проект' })
    expect(alerts[2]!.description).toContain('Handi')
    expect(alerts[2]!.description).not.toContain('Old')
  })

  test('grades server payments by days left and skips decommissioned servers', () => {
    const alerts = buildAlerts({
      now,
      projects: [],
      openInvoices: [],
      servers: [
        server({ id: 's1', name: 'vps-1', paidUntil: '2026-09-27' }),
        server({ id: 's2', name: 'vps-2', paidUntil: '2026-09-29' }),
        server({ id: 's3', name: 'vps-3', paidUntil: '2026-10-06' }),
        server({ id: 's4', name: 'vps-4', paidUntil: '2026-10-07' }),
        server({ id: 's5', name: 'vps-5', paidUntil: '2026-09-01', status: 'DECOMMISSIONED' }),
        server({ id: 's6', name: 'vps-6', paidUntil: null }),
      ],
    })

    expect(alerts.map((alert) => [alert.kind, alert.entityId])).toEqual([
      ['SERVER_PAYMENT_OVERDUE', 's1'],
      ['SERVER_PAYMENT_DUE', 's2'],
      ['SERVER_PAYMENT_DUE', 's3'],
    ])
    expect(alerts[0]!.title).toBe('Сервер vps-1: оплата просрочена на 2 дня')
    expect(alerts[1]!.title).toBe('Сервер vps-2: оплатить сегодня')
    expect(alerts[2]!.title).toBe('Сервер vps-3: оплата через 7 дней')
    expect(alerts[0]!.description).toContain('1 500 RUB'.replace(' ', ' '))
  })

  test('orders invoices by urgency and ignores drafts', () => {
    const alerts = buildAlerts({
      now,
      projects: [],
      servers: [],
      openInvoices: [
        invoice({ id: 'i1', title: 'Поддержка', dueAt: '2026-10-02' }),
        invoice({ id: 'i2', title: 'Разработка', dueAt: '2026-09-20' }),
        invoice({ id: 'i3', title: 'Черновик', dueAt: '2026-09-01', status: 'DRAFT' }),
        invoice({ id: 'i4', title: 'Без срока', dueAt: null }),
        invoice({ id: 'i5', title: 'Далеко', dueAt: '2026-11-01' }),
      ],
    })

    expect(alerts.map((alert) => [alert.kind, alert.severity, alert.entityId])).toEqual([
      ['INVOICE_OVERDUE', 'warning', 'i2'],
      ['INVOICE_DUE', 'info', 'i1'],
    ])
    expect(alerts[0]!.title).toBe('Счёт «Разработка» просрочен на 9 дней')
    expect(alerts[1]!.title).toBe('Счёт «Поддержка» к оплате через 3 дня')
  })
})

describe('pilot alerts', () => {
  test('warn a week before the pilot ends and escalate once it ends without a decision', () => {
    const pilot = (endsAt: string, state: 'ENDING' | 'AWAITING_DECISION' | 'DECIDED', daysLeft: number) => ({
      startsAt: '2026-09-19',
      endsAt,
      outcome: state === 'DECIDED' ? ('CONTINUE' as const) : null,
      state,
      daysLeft,
      blocksInvoicing: true,
    })
    const alerts = buildAlerts({
      now,
      servers: [],
      openInvoices: [],
      projects: [
        project({ id: 'p1', name: 'Moika', client: { id: 'c1', name: 'G-service' }, pilot: pilot('2026-10-02', 'ENDING', 3) }),
        project({ id: 'p2', name: 'Handi', pilot: pilot('2026-09-25', 'AWAITING_DECISION', -4) }),
        project({ id: 'p3', name: 'Zapis', pilot: pilot('2026-09-30', 'DECIDED', 1) }),
      ],
    })
    const pilotAlerts = alerts.filter((alert) => alert.kind.startsWith('PILOT'))
    expect(pilotAlerts.map((alert) => [alert.kind, alert.severity, alert.entityId])).toEqual([
      ['PILOT_DECISION_OVERDUE', 'critical', 'p2'],
      ['PILOT_ENDING', 'warning', 'p1'],
    ])
    expect(pilotAlerts[1]!.title).toBe('Пилот Moika (G-service) заканчивается через 3 дня')
  })
})
