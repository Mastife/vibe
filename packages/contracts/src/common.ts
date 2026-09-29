import { z } from 'zod'

/** Turns blank form input into `null` so optional fields can be cleared explicitly. */
export function blankToNull(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? null : value
}

function numberFromInput(value: unknown) {
  if (typeof value !== 'string') return value
  const normalized = value.replace(/\s+/g, '').replace(',', '.')
  if (normalized === '') return null
  const parsed = Number(normalized)
  return Number.isNaN(parsed) ? value : parsed
}

export const idSchema = z.uuid()
export const idParamSchema = z.object({ id: idSchema })

/** Calendar date without time, `YYYY-MM-DD`. */
export const isoDateSchema = z.iso.date()
/** Timestamp in RFC 3339 form, as produced by `Date#toISOString()`. */
export const isoDateTimeSchema = z.iso.datetime()

export const requiredText = (max: number) => z.string().trim().min(1).max(max)

export const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().min(1).max(max).nullable().optional())

export const optionalUrl = () =>
  z.preprocess(
    blankToNull,
    z.url({ protocol: /^https?$/, error: 'Нужна ссылка вида https://example.com' }).max(2048).nullable().optional(),
  )

export const optionalDate = () => z.preprocess(blankToNull, isoDateSchema.nullable().optional())

export const optionalId = () => z.preprocess(blankToNull, idSchema.nullable().optional())

const moneyValueSchema = z
  .number()
  .finite()
  .min(0, 'Сумма не может быть отрицательной')
  .max(1_000_000_000)
  .multipleOf(0.01, 'Не больше двух знаков после запятой')

export const moneySchema = z.preprocess(numberFromInput, moneyValueSchema)
export const optionalMoneySchema = z.preprocess(numberFromInput, moneyValueSchema.nullable().optional())

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Код валюты из трёх букв, например RUB')

export const moneyByCurrencySchema = z.object({
  currency: z.string(),
  amount: z.number(),
})

export const tagsSchema = z.array(z.string().trim().min(1).max(32)).max(20)

export type MoneyByCurrency = z.infer<typeof moneyByCurrencySchema>
