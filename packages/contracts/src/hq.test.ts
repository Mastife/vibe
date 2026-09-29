import { describe, expect, test } from 'bun:test'

import {
  clientUpdateSchema,
  currencySchema,
  invoiceCreateSchema,
  projectCreateSchema,
  projectUpdateSchema,
  serverCreateSchema,
  serverPaymentCreateSchema,
} from './index'

const clientId = '019a1a1a-1a1a-7a1a-8a1a-1a1a1a1a1a1a'

describe('project contracts', () => {
  test('normalizes blank optional fields and applies defaults', () => {
    const result = projectCreateSchema.parse({
      name: '  Мойка  ',
      slug: ' Moika-App ',
      description: '',
      repoUrl: '',
      productionUrl: 'https://moika.example.com',
      clientId: '',
      monthlyFee: '15 000,50',
      tags: ['prod', ' vps '],
    })

    expect(result).toMatchObject({
      name: 'Мойка',
      slug: 'moika-app',
      description: null,
      status: 'ACTIVE',
      repoUrl: null,
      productionUrl: 'https://moika.example.com',
      clientId: null,
      monthlyFee: 15000.5,
      currency: 'KZT',
      tags: ['prod', 'vps'],
    })
  })

  test('rejects non-http urls, bad slugs, and three-decimal money', () => {
    expect(projectCreateSchema.safeParse({ name: 'x', productionUrl: 'ftp://host' }).success).toBe(false)
    expect(projectCreateSchema.safeParse({ name: 'x', slug: 'Bad Slug!' }).success).toBe(false)
    expect(projectCreateSchema.safeParse({ name: 'x', monthlyFee: 10.123 }).success).toBe(false)
    expect(projectCreateSchema.safeParse({ name: 'x', clientId: 'not-a-uuid' }).success).toBe(false)
  })

  test('partial updates keep missing keys undefined and allow explicit clearing', () => {
    const result = projectUpdateSchema.parse({ notes: '', healthCheckUrl: 'http://10.0.0.1:3000/health' })

    expect(result).toEqual({ notes: null, healthCheckUrl: 'http://10.0.0.1:3000/health' })
    expect(result.notes).toBeNull()
    expect(result.healthCheckUrl).toBe('http://10.0.0.1:3000/health')
    expect('status' in result).toBe(false)
    expect('tags' in result).toBe(false)
  })
})

describe('server contracts', () => {
  test('defaults billing settings and coerces payment input', () => {
    expect(serverCreateSchema.parse({ name: 'vps-1' })).toMatchObject({
      name: 'vps-1',
      monthlyCost: 0,
      currency: 'KZT',
      billingPeriod: 'MONTHLY',
      status: 'ACTIVE',
    })

    expect(
      serverPaymentCreateSchema.parse({ amount: '1 200', paidAt: '2026-09-29', periods: '3', currency: 'usd' }),
    ).toEqual({
      amount: 1200,
      currency: 'USD',
      paidAt: '2026-09-29',
      periods: 3,
      note: undefined,
    })
  })

  test('rejects malformed dates and zero periods', () => {
    expect(serverCreateSchema.safeParse({ name: 'x', paidUntil: '29.09.2026' }).success).toBe(false)
    expect(serverPaymentCreateSchema.safeParse({ amount: 1, paidAt: '2026-09-29', periods: 0 }).success).toBe(false)
  })
})

describe('invoice and client contracts', () => {
  test('requires a client and a positive-or-zero amount', () => {
    expect(invoiceCreateSchema.safeParse({ title: 'Support', amount: 100 }).success).toBe(false)
    expect(invoiceCreateSchema.safeParse({ clientId, title: 'Support', amount: -1 }).success).toBe(false)

    const result = invoiceCreateSchema.parse({ clientId, title: 'Support', amount: '4500' })
    expect(result).toMatchObject({ clientId, title: 'Support', amount: 4500, currency: 'KZT', status: 'SENT' })
  })

  test('client updates clear email with a blank value and reject invalid emails', () => {
    expect(clientUpdateSchema.parse({ email: '' })).toEqual({ email: null })
    expect(clientUpdateSchema.safeParse({ email: 'nope' }).success).toBe(false)
  })

  test('currency codes are normalized to upper case', () => {
    expect(currencySchema.parse(' eur ')).toBe('EUR')
    expect(currencySchema.safeParse('rubles').success).toBe(false)
  })
})
