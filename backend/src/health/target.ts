import type { HttpCheckResult } from './checker'

/** What the monitor probes for one project; at least one part is set. */
export type MonitorPlan = {
  /** Health-check URL, else the production URL. */
  url: string | null
  /** Docker container over SSH, for bots and other services without an HTTP endpoint. */
  docker: { sshHost: string; container: string } | null
}

type PlanFields = {
  healthCheckUrl: string | null
  productionUrl: string | null
  sshHost: string | null
  dockerContainer: string | null
}

/**
 * The web part (health-check URL, else production URL) and the container part are independent:
 * a project with both is only up when the site answers and the container runs. Null = unmonitored.
 */
export function monitorPlan(project: PlanFields): MonitorPlan | null {
  const url = project.healthCheckUrl ?? project.productionUrl
  const docker =
    project.sshHost && project.dockerContainer ? { sshHost: project.sshHost, container: project.dockerContainer } : null
  return url || docker ? { url, docker } : null
}

/** Human-readable plan for the UI and alerts, e.g. "https://team.brofood.kz/healthz + docker portal-bot @ ubuntu@…". */
export function describePlan(plan: MonitorPlan | null): string | null {
  if (!plan) return null
  const parts = [plan.url, plan.docker ? `docker ${plan.docker.container} @ ${plan.docker.sshHost}` : null]
  return parts.filter(Boolean).join(' + ')
}

/**
 * Merges the web and container probes into one run: ok only when every part is ok. HTTP status,
 * latency, and certificate come from the web probe when there is one. With both parts, the web
 * error is labelled so the alert says which side failed.
 */
export function combineResults(web: HttpCheckResult | null, container: HttpCheckResult | null): HttpCheckResult {
  const parts = [web, container].filter((part): part is HttpCheckResult => part !== null)
  if (parts.length === 0) throw new Error('combineResults needs at least one probe result')
  const primary = web ?? container!
  const errors = [
    web?.error ? (container ? `Сайт: ${web.error}` : web.error) : null,
    container?.error ?? null,
  ].filter(Boolean)
  return {
    ok: parts.every((part) => part.ok),
    statusCode: primary.statusCode,
    latencyMs: primary.latencyMs,
    error: errors.length > 0 ? errors.join('; ') : null,
    sslExpiresAt: web?.sslExpiresAt ?? null,
  }
}
