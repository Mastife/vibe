/** Russian plural form for a count: plural(3, ['проект', 'проекта', 'проектов']). */
export function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

/** "15 000 ₸" for tenge, "15 000 USD" otherwise; never converts between currencies. */
export function formatMoney(amount: number, currency: string): string {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ${currency === 'KZT' ? '₸' : currency}`
}

const longDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** `2026-11-01` -> "1 ноября". */
export function formatDateLong(value: string): string {
  return longDateFormatter.format(new Date(`${value}T00:00:00Z`))
}

/** `2026-09` -> "сентябрь 2026 г.". */
export function formatMonth(period: string): string {
  return monthFormatter.format(new Date(`${period}-01T00:00:00Z`))
}

export function formatDays(days: number): string {
  return `${days} ${plural(days, ['день', 'дня', 'дней'])}`
}
