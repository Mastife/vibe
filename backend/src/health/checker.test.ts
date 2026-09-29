import { afterAll, describe, expect, test } from 'bun:test'

import { checkUrl } from './checker'

const noCertificate = async () => null

const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch(request) {
    const path = new URL(request.url).pathname
    if (path === '/ok') return new Response('ok')
    if (path === '/redirect') return Response.redirect(new URL('/ok', request.url), 302)
    if (path === '/slow') return new Promise((resolve) => setTimeout(() => resolve(new Response('late')), 300))
    return new Response('broken', { status: 503 })
  },
})

afterAll(() => {
  server.stop(true)
})

describe('checkUrl', () => {
  test('reports healthy responses with latency and follows redirects', async () => {
    const result = await checkUrl(`${server.url}redirect`, { timeoutMs: 2000, readCertificateExpiry: noCertificate })

    expect(result.ok).toBe(true)
    expect(result.statusCode).toBe(200)
    expect(result.error).toBeNull()
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(result.sslExpiresAt).toBeNull()
  })

  test('treats 4xx/5xx as down and keeps the status code', async () => {
    const result = await checkUrl(`${server.url}down`, { timeoutMs: 2000, readCertificateExpiry: noCertificate })

    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(503)
    expect(result.error).toBe('HTTP 503')
  })

  test('times out slow targets without throwing', async () => {
    const result = await checkUrl(`${server.url}slow`, { timeoutMs: 50, readCertificateExpiry: noCertificate })

    expect(result.ok).toBe(false)
    expect(result.statusCode).toBeNull()
    expect(result.error).toContain('50 мс')
  })

  test('reports connection failures as errors', async () => {
    const result = await checkUrl('http://127.0.0.1:1/', { timeoutMs: 2000, readCertificateExpiry: noCertificate })

    expect(result.ok).toBe(false)
    expect(result.error).toBeString()
  })

  test('attaches certificate expiry for https targets', async () => {
    const expiry = new Date('2027-01-01T00:00:00Z')
    const fetchImpl = async () => new Response('ok')
    const result = await checkUrl('https://example.com/health', {
      timeoutMs: 2000,
      fetchImpl,
      readCertificateExpiry: async (hostname, port) => {
        expect(hostname).toBe('example.com')
        expect(port).toBe(443)
        return expiry
      },
    })

    expect(result.ok).toBe(true)
    expect(result.sslExpiresAt).toEqual(expiry)
  })
})
