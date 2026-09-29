import { describe, expect, test } from 'bun:test'

import { dueBillingPeriod, formatIssuedInvoices } from './billing'

describe('dueBillingPeriod', () => {
  test('bills from the billing day through the grace window, then stops until next month', () => {
    expect(dueBillingPeriod(5, new Date('2026-10-04T00:00:00Z'))).toBeNull()
    expect(dueBillingPeriod(5, new Date('2026-10-05T00:00:00Z'))).toBe('2026-10')
    expect(dueBillingPeriod(5, new Date('2026-10-12T00:00:00Z'))).toBe('2026-10')
    expect(dueBillingPeriod(5, new Date('2026-10-13T00:00:00Z'))).toBeNull()
  })

  test('does not back-bill when auto-invoicing is switched on late in the month', () => {
    expect(dueBillingPeriod(1, new Date('2026-09-29T00:00:00Z'))).toBeNull()
    expect(dueBillingPeriod(1, new Date('2026-10-01T00:00:00Z'))).toBe('2026-10')
  })
})

describe('formatIssuedInvoices', () => {
  test('lists every issued invoice with amount in tenge and due date', () => {
    const text = formatIssuedInvoices([
      {
        clientName: 'BROFOOD <HQ>',
        title: 'Абонплата «Handi» за октябрь 2026 г.',
        amount: 60000,
        currency: 'KZT',
        dueAt: '2026-10-11',
      },
    ])
    const plain = text.replace(/[  ]/g, ' ')
    expect(plain).toContain('Выставлены счета')
    expect(text).toContain('BROFOOD &lt;HQ&gt;')
    expect(plain).toContain('60 000 ₸')
    expect(text).toContain('оплатить до 11 октября')
  })
})
