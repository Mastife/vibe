import type { PilotOutcome, ProjectPilot } from '@projects-hq/contracts'

import { daysBetween, toDateOnlyOrNull, todayUtc } from '../lib/dates'

/** A pilot enters the "ending" band this many days before its last day. */
export const pilotEndingDays = 7

/**
 * A pilot is free for the client: no subscription invoice through its last day, and none after it
 * until the client has decided to continue (a declined pilot stays blocked).
 */
export function pilotBlocksInvoicing(endsAt: Date | null, outcome: PilotOutcome | null, now: Date): boolean {
  if (!endsAt) return false
  return todayUtc(now) <= endsAt || outcome !== 'CONTINUE'
}

/** Derives the pilot's state for display, alerts, reminders, and billing; the decision closes it regardless of dates. */
export function projectPilot(
  startsAt: Date | null,
  endsAt: Date | null,
  outcome: PilotOutcome | null,
  now: Date,
): ProjectPilot {
  const base = {
    startsAt: toDateOnlyOrNull(startsAt),
    endsAt: toDateOnlyOrNull(endsAt),
    outcome,
    blocksInvoicing: pilotBlocksInvoicing(endsAt, outcome, now),
  }
  if (outcome) {
    return { ...base, state: 'DECIDED', daysLeft: endsAt ? daysBetween(todayUtc(now), endsAt) : null }
  }
  if (!endsAt) return { ...base, state: 'NONE', daysLeft: null }

  const daysLeft = daysBetween(todayUtc(now), endsAt)
  if (daysLeft < 0) return { ...base, state: 'AWAITING_DECISION', daysLeft }
  if (daysLeft <= pilotEndingDays) return { ...base, state: 'ENDING', daysLeft }
  return { ...base, state: 'ACTIVE', daysLeft }
}
