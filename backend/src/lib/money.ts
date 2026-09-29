import type { MoneyByCurrency } from '@projects-hq/contracts'

type DecimalLike = { toNumber(): number } | number | string | null | undefined

export function decimalToNumber(value: DecimalLike): number
export function decimalToNumber(value: DecimalLike, nullable: true): number | null
export function decimalToNumber(value: DecimalLike, nullable?: true): number | null {
  if (value === null || value === undefined) {
    return nullable ? null : 0
  }
  if (typeof value === 'number') return roundMoney(value)
  if (typeof value === 'string') return roundMoney(Number(value))
  return roundMoney(value.toNumber())
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** Sums amounts per currency; never converts between currencies. */
export function sumByCurrency(rows: Iterable<{ currency: string; amount: number }>): MoneyByCurrency[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amount)
  }
  return [...totals.entries()]
    .filter(([, amount]) => amount !== 0)
    .map(([currency, amount]) => ({ currency, amount: roundMoney(amount) }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}
