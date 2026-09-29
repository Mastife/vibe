import { describe, expect, test } from 'bun:test'

import { scheduleLoop } from './worker'

describe('scheduleLoop', () => {
  test('runs immediately, repeats on the interval, and survives failures until aborted', async () => {
    const controller = new AbortController()
    let runs = 0
    const loop = scheduleLoop(
      {
        name: 'test',
        intervalMs: 5,
        runImmediately: true,
        run: async () => {
          runs += 1
          if (runs === 2) throw new Error('boom')
        },
      },
      controller.signal,
    )

    await new Promise((resolve) => setTimeout(resolve, 40))
    controller.abort()
    await loop

    expect(runs).toBeGreaterThanOrEqual(3)
  })

  test('does not run when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    let runs = 0
    await scheduleLoop({ name: 'test', intervalMs: 5, runImmediately: true, run: async () => void runs++ }, controller.signal)
    expect(runs).toBe(0)
  })
})
