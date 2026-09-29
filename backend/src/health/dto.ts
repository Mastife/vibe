import type { HealthCheckRunDto } from '@projects-hq/contracts'

import type { DbClient } from '../db'
import { toIsoOrNull } from '../lib/dates'

export type HealthCheckRunRow = Awaited<ReturnType<DbClient['healthCheckRun']['findMany']>>[number]

export function toHealthRunDto(row: HealthCheckRunRow): HealthCheckRunDto {
  return {
    id: row.id,
    checkedAt: row.checkedAt.toISOString(),
    ok: row.ok,
    statusCode: row.statusCode,
    latencyMs: row.latencyMs,
    error: row.error,
    sslExpiresAt: toIsoOrNull(row.sslExpiresAt),
  }
}
