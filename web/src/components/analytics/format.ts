const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const monthLongFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const compactFormatter = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 })

/** `2026-09` -> "сент. 26". */
export function formatMonthShort(month: string): string {
  return monthFormatter.format(new Date(`${month}-01T00:00:00Z`))
}

/** `2026-09` -> "сентябрь 2026 г.". */
export function formatMonthLong(month: string): string {
  return monthLongFormatter.format(new Date(`${month}-01T00:00:00Z`))
}

/** `2026-09-29` -> "29 сент.". */
export function formatDayShort(date: string): string {
  return dayFormatter.format(new Date(`${date}T00:00:00Z`))
}

/** Axis ticks: "7,3 тыс.". */
export function formatCompact(value: number): string {
  return compactFormatter.format(value)
}

/** Keeps category axis labels on one line; the full name stays in the tooltip. */
export function shortName(name: string): string {
  return name.length > 22 ? `${name.slice(0, 21).trimEnd()}…` : name
}
