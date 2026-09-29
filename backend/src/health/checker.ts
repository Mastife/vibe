import tls from 'node:tls'

import type { FetchLike } from '../lib/fetch'

export type HttpCheckResult = {
  ok: boolean
  statusCode: number | null
  latencyMs: number
  error: string | null
  sslExpiresAt: Date | null
}

export type CheckUrlOptions = {
  timeoutMs: number
  fetchImpl?: FetchLike
  readCertificateExpiry?: (hostname: string, port: number, timeoutMs: number) => Promise<Date | null>
}

const userAgent = 'projects-hq-monitor/1.0'

/** Performs one HTTP(S) probe; never throws so a single bad target cannot break a batch. */
export async function checkUrl(url: string, options: CheckUrlOptions): Promise<HttpCheckResult> {
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch
  const readCertificateExpiry = options.readCertificateExpiry ?? readTlsCertificateExpiry
  const target = new URL(url)
  const certificatePromise =
    target.protocol === 'https:'
      ? readCertificateExpiry(target.hostname, Number(target.port || 443), options.timeoutMs).catch(() => null)
      : Promise.resolve(null)

  const startedAt = performance.now()
  let statusCode: number | null = null
  let error: string | null = null

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': userAgent, Accept: '*/*' },
      signal: AbortSignal.timeout(options.timeoutMs),
    })
    statusCode = response.status
    await response.body?.cancel().catch(() => undefined)
    if (response.status >= 400) {
      error = `HTTP ${response.status}`
    }
  } catch (caught) {
    error = describeFetchError(caught, options.timeoutMs)
  }

  const latencyMs = Math.round(performance.now() - startedAt)
  const sslExpiresAt = await certificatePromise

  return {
    ok: error === null,
    statusCode,
    latencyMs,
    error,
    sslExpiresAt,
  }
}

function describeFetchError(caught: unknown, timeoutMs: number): string {
  if (caught instanceof Error) {
    if (caught.name === 'TimeoutError' || caught.name === 'AbortError') {
      return `Нет ответа за ${timeoutMs} мс`
    }
    const cause = caught.cause instanceof Error ? caught.cause.message : undefined
    const rawCode = (caught as { code?: unknown }).code
    const code = typeof rawCode === 'string' ? rawCode : undefined
    return [code, cause ?? caught.message].filter(Boolean).join(': ').slice(0, 500)
  }
  return String(caught).slice(0, 500)
}

/** Reads the leaf certificate's notAfter date; resolves null when the handshake fails or times out. */
export function readTlsCertificateExpiry(hostname: string, port: number, timeoutMs: number): Promise<Date | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: Date | null) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }

    const socket = tls.connect({ host: hostname, port, servername: hostname, timeout: timeoutMs }, () => {
      const certificate = socket.getPeerCertificate()
      const validTo = certificate && 'valid_to' in certificate ? new Date(certificate.valid_to) : null
      finish(validTo && !Number.isNaN(validTo.getTime()) ? validTo : null)
    })
    socket.on('error', () => finish(null))
    socket.on('timeout', () => finish(null))
  })
}
