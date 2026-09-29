/** Russian plural form for a count: plural(3, ['проект', 'проекта', 'проектов']). */
export function plural(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

export function formatMoney(amount: number, currency: string): string {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(amount)} ${currency}`
}

export function formatDays(days: number): string {
  return `${days} ${plural(days, ['день', 'дня', 'дней'])}`
}
