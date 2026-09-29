import type { HealthStatus } from '@projects-hq/contracts'

export type HealthState = { status: HealthStatus; consecutiveFailures: number }

/**
 * Applies one check result. A success is UP at once; a failure only turns the project DOWN after
 * `downAfter` failures in a row, so a single timeout does not raise an alert. Until then the
 * previous status is kept (UNKNOWN stays UNKNOWN for a project that was never checked).
 */
export function nextHealthState(previous: HealthState, ok: boolean, downAfter: number): HealthState {
  if (ok) return { status: 'UP', consecutiveFailures: 0 }
  const consecutiveFailures = previous.consecutiveFailures + 1
  return {
    status: consecutiveFailures >= downAfter ? 'DOWN' : previous.status,
    consecutiveFailures,
  }
}
