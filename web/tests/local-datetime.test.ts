import { expect, test } from 'bun:test'

import { fromLocalInputValue, toLocalDateValue, toLocalInputValue } from '../src/lib/local-datetime'

test('a moment round-trips through a datetime-local field in the browser timezone', () => {
  const moment = new Date(2026, 9, 3, 9, 5, 42)
  expect(toLocalInputValue(moment)).toBe('2026-10-03T09:05')
  expect(fromLocalInputValue('2026-10-03T09:05')).toBe(new Date(2026, 9, 3, 9, 5).toISOString())
})

test('an empty or broken field value is not a moment', () => {
  expect(fromLocalInputValue('')).toBeNull()
  expect(fromLocalInputValue('03.10.2026 09:05')).toBeNull()
})

test('a calendar day is taken in the browser timezone, not UTC', () => {
  expect(toLocalDateValue(new Date(2026, 9, 4, 23, 30))).toBe('2026-10-04')
  expect(toLocalDateValue(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01')
})
