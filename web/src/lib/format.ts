const moneyFormatters = new Map<string, Intl.NumberFormat>()

/** "15 000 ₸" for KZT, otherwise "15 000 USD" - never converts between currencies. */
export function formatMoney(amount: number, currency: string): string {
  let formatter = moneyFormatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
    moneyFormatters.set(currency, formatter)
  }
  return `${formatter.format(amount)} ${currency === 'KZT' ? '₸' : currency}`
}

export function formatMoneyList(entries: Array<{ currency: string; amount: number }>, empty = '—'): string {
  if (entries.length === 0) return empty
  return entries.map((entry) => formatMoney(entry.amount, entry.currency)).join(' · ')
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** Formats a `YYYY-MM-DD` value without timezone drift. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return dateFormatter.format(new Date(`${value}T00:00:00Z`))
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return dateTimeFormatter.format(new Date(value))
}

/** "5 мин назад", "2 ч назад", "3 дн назад" for recent timestamps. */
export function formatRelative(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return '—'
  const diffMs = now.getTime() - new Date(value).getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} дн назад`
  return formatDateTime(value)
}

export function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

export function formatDays(days: number): string {
  return `${days} ${plural(days, ['день', 'дня', 'дней'])}`
}

export function formatLatency(latencyMs: number | null | undefined): string {
  if (latencyMs === null || latencyMs === undefined) return '—'
  return `${latencyMs} мс`
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`
}

export function todayDateOnly(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function hostnameOf(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
