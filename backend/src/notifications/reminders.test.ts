import { describe, expect, test } from 'bun:test'
import type { DomainDto, InvoiceDto, ProjectDto, ServerDto } from '@projects-hq/contracts'

import { collectReminders, formatReminders, reminderThreshold } from './reminders'

const now = new Date('2026-09-29T08:00:00Z')
const iso = now.toISOString()

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

function domain(overrides: Partial<DomainDto> & { id: string; name: string }): DomainDto {
  return {
    registrar: null,
    projectId: null,
    project: null,
    expiresAt: '2026-10-29',
    renewalCost: 0,
    currency: 'KZT',
    notes: null,
    expirySyncedAt: null,
    renewal: { state: 'DUE_SOON', daysLeft: 30 },
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  }
}

function invoice(overrides: Partial<InvoiceDto> & { id: string }): InvoiceDto {
  return {
    clientId: 'c1',
    clientName: 'BROFOOD',
    projectId: null,
    projectName: null,
    title: 'Абонплата',
    amount: 60000,
    currency: 'KZT',
    status: 'SENT',
    issuedAt: '2026-09-20',
    dueAt: '2026-09-30',
    paidAt: null,
    note: null,
    isOverdue: false,
    autoPeriod: null,
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  }
}

describe('reminderThreshold', () => {
  test('picks the tightest crossed threshold, nothing while far away, -1 once overdue', () => {
    const thresholds = [7, 3, 1, 0]
    expect(reminderThreshold(8, thresholds)).toBeNull()
    expect(reminderThreshold(7, thresholds)).toBe(7)
    expect(reminderThreshold(5, thresholds)).toBe(7)
    expect(reminderThreshold(2, thresholds)).toBe(3)
    expect(reminderThreshold(1, thresholds)).toBe(1)
    expect(reminderThreshold(0, thresholds)).toBe(0)
    expect(reminderThreshold(-4, thresholds)).toBe(-1)
  })
})

describe('collectReminders', () => {
  test('covers servers, domains, and client invoices with per-kind windows', () => {
    const reminders = collectReminders({
      now,
      servers: [
        server({ id: 's1', name: 'G-service', paidUntil: '2026-10-02' }),
        server({ id: 's2', name: 'NaviGo', paidUntil: '2026-11-01' }),
        server({ id: 's3', name: 'Old', paidUntil: '2026-09-30', status: 'DECOMMISSIONED' }),
        server({ id: 's4', name: 'Client-paid', paidUntil: '2026-09-30', monthlyCost: 0 }),
      ],
      domains: [
        domain({ id: 'd1', name: 'navigo.help', expiresAt: '2026-10-20', renewalCost: 9000 }),
        domain({ id: 'd2', name: 'far.kz', expiresAt: '2027-05-01' }),
      ],
      invoices: [
        invoice({ id: 'i1', dueAt: '2026-09-30' }),
        invoice({ id: 'i2', dueAt: '2026-09-20' }),
        invoice({ id: 'i3', dueAt: '2026-09-30', status: 'PAID' }),
      ],
    })

    expect(reminders.map((item) => [item.kind, item.entityId, item.threshold])).toEqual([
      ['INVOICE_DUE', 'i2', -1],
      ['INVOICE_DUE', 'i1', 1],
      ['SERVER_PAYMENT', 's1', 3],
      ['DOMAIN_RENEWAL', 'd1', 30],
    ])
  })
})

describe('formatReminders', () => {
  test('renders a readable Russian message with amounts and dates', () => {
    const text = formatReminders(
      collectReminders({
        now,
        servers: [server({ id: 's1', name: 'G-service', paidUntil: '2026-10-02' })],
        domains: [domain({ id: 'd1', name: 'navigo.help', expiresAt: '2026-09-29', renewalCost: 9000 })],
        invoices: [invoice({ id: 'i2', dueAt: '2026-09-20' })],
      }),
      'http://localhost:5173',
    )

    const plain = text.replace(/[  ]/g, ' ')
    expect(plain).toContain('Напоминание о платежах и сроках')
    expect(plain).toContain('⚠️ BROFOOD: счёт «Абонплата»: оплата просрочена на 9 дней (срок 20 сентября) — 60 000 ₸')
    expect(plain).toContain('🌐 Домен navigo.help: продлить сегодня — 9 000 ₸')
    expect(plain).toContain('🖥 Сервер G-service: оплатить через 3 дня, до 2 октября — 3 750 ₸')
    expect(text).toContain('http://localhost:5173')
  })
})

describe('pilot reminders', () => {
  const pilotProject = (id: string, endsAt: string, outcome: 'CONTINUE' | 'DECLINE' | null = null) =>
    ({
      id,
      name: 'Moika',
      status: 'ACTIVE',
      client: { id: 'c2', name: 'G-service' },
      pilot: { startsAt: '2026-09-19', endsAt, outcome, state: 'ACTIVE', daysLeft: null },
    }) as unknown as ProjectDto

  test('nudge an undecided pilot before its end and once after, never a decided one', () => {
    const reminders = collectReminders({
      now,
      projects: [
        pilotProject('p1', '2026-10-02'),
        pilotProject('p2', '2026-09-25'),
        pilotProject('p3', '2026-10-01', 'CONTINUE'),
        pilotProject('p4', '2026-12-01'),
      ],
      servers: [],
      domains: [],
      invoices: [],
    })
    expect(reminders.map((item) => [item.entityId, item.threshold])).toEqual([
      ['p2', -1],
      ['p1', 3],
    ])

    const text = formatReminders(reminders).replace(/[  ]/g, ' ')
    expect(text).toContain('Напоминание о пилотах')
    expect(text).toContain('🧪 Пилот Moika (G-service): заканчивается через 3 дня, 2 октября — обсудите с клиентом продолжение')
    expect(text).toContain('⚠️ Пилот Moika (G-service): закончился 4 дня назад (25 сентября), решение клиента не отмечено')
  })
})
