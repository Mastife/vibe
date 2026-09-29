import { describe, expect, test } from 'bun:test'

import type { HttpCheckResult } from './checker'
import { combineResults, describePlan, monitorPlan } from './target'

const fields = {
  healthCheckUrl: null,
  productionUrl: null,
  sshHost: null,
  dockerContainer: null,
}

const probe = (overrides: Partial<HttpCheckResult> = {}): HttpCheckResult => ({
  ok: true,
  statusCode: 200,
  latencyMs: 80,
  error: null,
  sslExpiresAt: null,
  ...overrides,
})

describe('monitorPlan', () => {
  test('prefers the health-check URL over the production URL and adds the container alongside', () => {
    const plan = monitorPlan({
      ...fields,
      healthCheckUrl: 'https://team.brofood.kz/healthz',
      productionUrl: 'https://team.brofood.kz',
      sshHost: 'ubuntu@194.238.42.51',
      dockerContainer: 'portal-bot',
    })
    expect(plan).toEqual({
      url: 'https://team.brofood.kz/healthz',
      docker: { sshHost: 'ubuntu@194.238.42.51', container: 'portal-bot' },
    })
    expect(describePlan(plan)).toBe('https://team.brofood.kz/healthz + docker portal-bot @ ubuntu@194.238.42.51')
  })

  test('works with only one part and is null with none', () => {
    expect(monitorPlan({ ...fields, productionUrl: 'https://x.kz' })).toEqual({ url: 'https://x.kz', docker: null })
    expect(monitorPlan({ ...fields, sshHost: 'u@h', dockerContainer: 'bot' })).toEqual({
      url: null,
      docker: { sshHost: 'u@h', container: 'bot' },
    })
    expect(monitorPlan({ ...fields, sshHost: 'u@h' })).toBeNull()
    expect(describePlan(null)).toBeNull()
  })
})

describe('combineResults', () => {
  const certificate = new Date('2026-12-01T00:00:00Z')

  test('is ok only when both parts are ok and keeps the web status, latency, and certificate', () => {
    expect(
      combineResults(probe({ sslExpiresAt: certificate }), probe({ statusCode: null, latencyMs: 3000 })),
    ).toEqual({ ok: true, statusCode: 200, latencyMs: 80, error: null, sslExpiresAt: certificate })
  })

  test('says which side failed', () => {
    const botDown = combineResults(probe(), probe({ ok: false, statusCode: null, error: 'Контейнер portal-bot: exited' }))
    expect(botDown).toMatchObject({ ok: false, statusCode: 200, error: 'Контейнер portal-bot: exited' })

    const siteDown = combineResults(probe({ ok: false, statusCode: 503, error: 'HTTP 503' }), probe({ statusCode: null }))
    expect(siteDown).toMatchObject({ ok: false, error: 'Сайт: HTTP 503' })

    const both = combineResults(
      probe({ ok: false, statusCode: 503, error: 'HTTP 503' }),
      probe({ ok: false, statusCode: null, error: 'Контейнер portal-bot: exited' }),
    )
    expect(both.error).toBe('Сайт: HTTP 503; Контейнер portal-bot: exited')
  })

  test('a single part passes through unchanged', () => {
    expect(combineResults(probe({ ok: false, error: 'HTTP 502', statusCode: 502 }), null)).toMatchObject({
      ok: false,
      error: 'HTTP 502',
    })
    expect(combineResults(null, probe({ statusCode: null, latencyMs: 3500 }))).toMatchObject({
      ok: true,
      statusCode: null,
      latencyMs: 3500,
    })
  })
})
