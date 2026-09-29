import { describe, expect, test } from 'bun:test'

import { addBillingPeriods, daysBetween, parseDateOnly, toDateOnly } from './dates'
import { decimalToNumber, sumByCurrency } from './money'
import { slugify, uniqueSlug } from './slug'

describe('dates', () => {
  test('round-trips date-only values through UTC midnight', () => {
    const date = parseDateOnly('2026-02-28')
    expect(date.toISOString()).toBe('2026-02-28T00:00:00.000Z')
    expect(toDateOnly(date)).toBe('2026-02-28')
  })

  test('adds billing periods calendar-wise and clamps month ends', () => {
    expect(toDateOnly(addBillingPeriods(parseDateOnly('2026-01-31'), 'MONTHLY', 1))).toBe('2026-02-28')
    expect(toDateOnly(addBillingPeriods(parseDateOnly('2026-09-29'), 'QUARTERLY', 1))).toBe('2026-12-29')
    expect(toDateOnly(addBillingPeriods(parseDateOnly('2026-09-29'), 'YEARLY', 2))).toBe('2028-09-29')
    expect(toDateOnly(addBillingPeriods(parseDateOnly('2026-11-30'), 'MONTHLY', 3))).toBe('2027-02-28')
  })

  test('counts whole calendar days including negative distances', () => {
    expect(daysBetween(parseDateOnly('2026-09-29'), parseDateOnly('2026-10-06'))).toBe(7)
    expect(daysBetween(new Date('2026-09-29T23:59:00Z'), parseDateOnly('2026-09-27'))).toBe(-2)
  })
})

describe('money', () => {
  test('converts decimals and sums per currency without mixing them', () => {
    expect(decimalToNumber({ toNumber: () => 10.005 })).toBe(10.01)
    expect(decimalToNumber(null, true)).toBeNull()
    expect(decimalToNumber(null)).toBe(0)
    expect(
      sumByCurrency([
        { currency: 'RUB', amount: 1000 },
        { currency: 'USD', amount: 20 },
        { currency: 'RUB', amount: 500.5 },
        { currency: 'EUR', amount: 0 },
      ]),
    ).toEqual([
      { currency: 'RUB', amount: 1500.5 },
      { currency: 'USD', amount: 20 },
    ])
  })
})

describe('slug', () => {
  test('transliterates cyrillic names into url-safe slugs', () => {
    expect(slugify('Мойка Premium 2.0')).toBe('moyka-premium-2-0')
    expect(slugify('  HR-Pro / Sales Agent  ')).toBe('hr-pro-sales-agent')
    expect(slugify('Ъ')).toBe('project')
  })

  test('appends numeric suffixes until the slug is free', async () => {
    const taken = new Set(['moika', 'moika-2'])
    expect(await uniqueSlug('moika', async (candidate) => taken.has(candidate))).toBe('moika-3')
    expect(await uniqueSlug('fresh', async () => false)).toBe('fresh')
  })
})
