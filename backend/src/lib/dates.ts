import type { BillingPeriod } from '@projects-hq/contracts'

const dayMs = 24 * 60 * 60 * 1000

/** Formats a Date as `YYYY-MM-DD` in UTC. Date-only columns come back from PostgreSQL at UTC midnight. */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Parses `YYYY-MM-DD` into a UTC-midnight Date suitable for `@db.Date` columns. */
export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day!))
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function todayUtc(now: Date = new Date()): Date {
  return startOfUtcDay(now)
}

/** Whole days from `from` to `to` (UTC calendar days, negative when `to` is in the past). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / dayMs)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * dayMs)
}

const monthsPerPeriod: Record<BillingPeriod, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
}

/** Adds billing periods calendar-wise, clamping the 31st to the last day of shorter months. */
export function addBillingPeriods(date: Date, period: BillingPeriod, periods: number): Date {
  const months = monthsPerPeriod[period] * periods
  const year = date.getUTCFullYear()
  const monthIndex = date.getUTCMonth() + months
  const targetMonthLength = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const day = Math.min(date.getUTCDate(), targetMonthLength)
  return new Date(Date.UTC(year, monthIndex, day))
}

export function monthlyEquivalent(amount: number, period: BillingPeriod): number {
  return amount / monthsPerPeriod[period]
}

export function toIsoOrNull(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}

export function toDateOnlyOrNull(date: Date | null | undefined): string | null {
  return date ? toDateOnly(date) : null
}

export function parseDateOnlyOrNull(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return parseDateOnly(value)
}
