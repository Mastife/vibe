import { describe, expect, test } from 'bun:test'

import { pilotBlocksInvoicing, projectPilot } from './pilot'

const now = new Date('2026-09-29T12:00:00Z')
const day = (value: string) => new Date(`${value}T00:00:00Z`)

describe('projectPilot', () => {
  test('has no pilot without an end date', () => {
    expect(projectPilot(day('2026-09-19'), null, null, now)).toEqual({
      startsAt: '2026-09-19',
      endsAt: null,
      outcome: null,
      state: 'NONE',
      daysLeft: null,
      blocksInvoicing: false,
    })
  })

  test('moves from active to ending a week out, then to awaiting a decision', () => {
    expect(projectPilot(null, day('2026-10-19'), null, now)).toMatchObject({ state: 'ACTIVE', daysLeft: 20 })
    expect(projectPilot(null, day('2026-10-06'), null, now)).toMatchObject({ state: 'ENDING', daysLeft: 7 })
    expect(projectPilot(null, day('2026-09-29'), null, now)).toMatchObject({ state: 'ENDING', daysLeft: 0 })
    expect(projectPilot(null, day('2026-09-27'), null, now)).toMatchObject({ state: 'AWAITING_DECISION', daysLeft: -2 })
  })

  test('a recorded outcome closes the pilot whatever the dates', () => {
    expect(projectPilot(null, day('2026-09-27'), 'CONTINUE', now)).toMatchObject({
      state: 'DECIDED',
      outcome: 'CONTINUE',
      daysLeft: -2,
      blocksInvoicing: false,
    })
    expect(projectPilot(null, null, 'DECLINE', now)).toMatchObject({ state: 'DECIDED', daysLeft: null })
  })
})

describe('pilotBlocksInvoicing', () => {
  test('never blocks a project without a pilot', () => {
    expect(pilotBlocksInvoicing(null, null, now)).toBe(false)
  })

  test('blocks through the last pilot day, even when the client already agreed to continue', () => {
    expect(pilotBlocksInvoicing(day('2026-10-19'), null, now)).toBe(true)
    expect(pilotBlocksInvoicing(day('2026-09-29'), 'CONTINUE', now)).toBe(true)
  })

  test('after the pilot, only a decision to continue unblocks billing', () => {
    expect(pilotBlocksInvoicing(day('2026-09-28'), null, now)).toBe(true)
    expect(pilotBlocksInvoicing(day('2026-09-28'), 'DECLINE', now)).toBe(true)
    expect(pilotBlocksInvoicing(day('2026-09-28'), 'CONTINUE', now)).toBe(false)
  })
})
