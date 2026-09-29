import { describe, expect, test } from 'bun:test'

import { nextHealthState } from './transition'

describe('nextHealthState', () => {
  test('a single failure keeps the project up and only counts it', () => {
    expect(nextHealthState({ status: 'UP', consecutiveFailures: 0 }, false, 2)).toEqual({
      status: 'UP',
      consecutiveFailures: 1,
    })
  })

  test('the second failure in a row marks the project down', () => {
    expect(nextHealthState({ status: 'UP', consecutiveFailures: 1 }, false, 2)).toEqual({
      status: 'DOWN',
      consecutiveFailures: 2,
    })
    expect(nextHealthState({ status: 'DOWN', consecutiveFailures: 2 }, false, 2)).toEqual({
      status: 'DOWN',
      consecutiveFailures: 3,
    })
  })

  test('a success resets the streak and recovers immediately', () => {
    expect(nextHealthState({ status: 'UP', consecutiveFailures: 1 }, true, 2)).toEqual({
      status: 'UP',
      consecutiveFailures: 0,
    })
    expect(nextHealthState({ status: 'DOWN', consecutiveFailures: 5 }, true, 2)).toEqual({
      status: 'UP',
      consecutiveFailures: 0,
    })
  })

  test('a never-checked project stays unknown until the threshold, and threshold 1 is immediate', () => {
    expect(nextHealthState({ status: 'UNKNOWN', consecutiveFailures: 0 }, false, 2).status).toBe('UNKNOWN')
    expect(nextHealthState({ status: 'UP', consecutiveFailures: 0 }, false, 1).status).toBe('DOWN')
  })
})
