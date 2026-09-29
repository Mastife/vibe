import { describe, expect, test } from 'bun:test'

import { domainCreateSchema, projectCreateSchema, projectUpdateSchema } from './index'

describe('domain contracts', () => {
  test('normalizes the host name and defaults to tenge', () => {
    expect(domainCreateSchema.parse({ name: ' NaviGo.Help ', expiresAt: '' })).toMatchObject({
      name: 'navigo.help',
      expiresAt: null,
      renewalCost: 0,
      currency: 'KZT',
    })
    expect(domainCreateSchema.parse({ name: 'menu.brofood.kz', renewalCost: '4 500' }).renewalCost).toBe(4500)
  })

  test('rejects URLs, bare labels, and malformed hosts', () => {
    for (const name of ['https://navigo.help', 'navigo.help/app', 'localhost', '-bad.kz', 'bad-.kz', 'a..kz']) {
      expect(domainCreateSchema.safeParse({ name }).success).toBe(false)
    }
  })
})

describe('project auto-invoicing contracts', () => {
  test('is off by default and bills on the 1st', () => {
    expect(projectCreateSchema.parse({ name: 'Handi' })).toMatchObject({ autoInvoice: false, billingDay: 1 })
  })

  test('accepts a billing day from 1 to 28 only', () => {
    expect(projectUpdateSchema.parse({ billingDay: '15' }).billingDay).toBe(15)
    expect(projectUpdateSchema.safeParse({ billingDay: 0 }).success).toBe(false)
    expect(projectUpdateSchema.safeParse({ billingDay: 29 }).success).toBe(false)
  })
})

describe('project pilot contracts', () => {
  test('accepts an open pilot and clears fields from blank form input', () => {
    expect(projectCreateSchema.parse({ name: 'Moika', pilotStartsAt: '2026-09-19', pilotEndsAt: '2026-10-19' })).toMatchObject({
      pilotStartsAt: '2026-09-19',
      pilotEndsAt: '2026-10-19',
    })
    expect(projectUpdateSchema.parse({ pilotEndsAt: '', pilotOutcome: '' })).toEqual({ pilotEndsAt: null, pilotOutcome: null })
    expect(projectUpdateSchema.parse({ pilotOutcome: 'CONTINUE' }).pilotOutcome).toBe('CONTINUE')
  })

  test('rejects a pilot that ends before it starts and unknown outcomes', () => {
    const backwards = projectUpdateSchema.safeParse({ pilotStartsAt: '2026-10-19', pilotEndsAt: '2026-09-19' })
    expect(backwards.success).toBe(false)
    expect(backwards.error?.issues[0]?.path).toEqual(['pilotEndsAt'])
    expect(projectUpdateSchema.safeParse({ pilotOutcome: 'MAYBE' }).success).toBe(false)
  })
})
