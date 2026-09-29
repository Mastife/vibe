import { z } from 'zod'

import {
  currencySchema,
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  moneySchema,
  optionalDate,
  optionalText,
  optionalUrl,
  requiredText,
} from './common'
import { projectRefSchema } from './projects'

export const serverStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'DECOMMISSIONED'])
export const billingPeriodSchema = z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY'])
export const paymentStateSchema = z.enum(['OK', 'DUE_SOON', 'OVERDUE', 'UNKNOWN'])

export const serverPaymentSchema = z.object({
  id: idSchema,
  serverId: idSchema,
  amount: z.number(),
  currency: z.string(),
  paidAt: isoDateSchema,
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  note: z.string().nullable(),
  createdAt: isoDateTimeSchema,
})

export const serverSchema = z.object({
  id: idSchema,
  name: z.string(),
  provider: z.string().nullable(),
  host: z.string().nullable(),
  location: z.string().nullable(),
  specs: z.string().nullable(),
  panelUrl: z.string().nullable(),
  monthlyCost: z.number(),
  currency: z.string(),
  billingPeriod: billingPeriodSchema,
  paidUntil: isoDateSchema.nullable(),
  status: serverStatusSchema,
  notes: z.string().nullable(),
  projects: z.array(projectRefSchema),
  payment: z.object({
    state: paymentStateSchema,
    daysLeft: z.number().int().nullable(),
  }),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

const serverFieldsSchema = z.object({
  name: requiredText(120),
  provider: optionalText(80),
  host: optionalText(255),
  location: optionalText(120),
  specs: optionalText(255),
  panelUrl: optionalUrl(),
  monthlyCost: moneySchema,
  currency: currencySchema,
  billingPeriod: billingPeriodSchema,
  paidUntil: optionalDate(),
  status: serverStatusSchema,
  notes: optionalText(5000),
})

export const serverCreateSchema = serverFieldsSchema.extend({
  monthlyCost: moneySchema.default(0),
  currency: currencySchema.default('RUB'),
  billingPeriod: billingPeriodSchema.default('MONTHLY'),
  status: serverStatusSchema.default('ACTIVE'),
})

// Defaults would silently reset fields on PATCH, so updates derive from the default-free base.
export const serverUpdateSchema = serverFieldsSchema.partial()

export const serverPaymentCreateSchema = z.object({
  amount: moneySchema,
  currency: currencySchema.optional(),
  paidAt: isoDateSchema,
  periods: z.coerce.number().int().min(1).max(36).default(1),
  note: optionalText(500),
})

export const serverListResponseSchema = z.object({
  servers: z.array(serverSchema),
})

export const serverResponseSchema = z.object({
  server: serverSchema,
})

export const serverDetailResponseSchema = z.object({
  server: serverSchema,
  payments: z.array(serverPaymentSchema),
})

export type ServerStatus = z.infer<typeof serverStatusSchema>
export type BillingPeriod = z.infer<typeof billingPeriodSchema>
export type PaymentState = z.infer<typeof paymentStateSchema>
export type ServerDto = z.infer<typeof serverSchema>
export type ServerPaymentDto = z.infer<typeof serverPaymentSchema>
export type ServerCreateInput = z.input<typeof serverCreateSchema>
export type ServerCreatePayload = z.output<typeof serverCreateSchema>
export type ServerUpdateInput = z.input<typeof serverUpdateSchema>
export type ServerUpdatePayload = z.output<typeof serverUpdateSchema>
export type ServerPaymentCreateInput = z.input<typeof serverPaymentCreateSchema>
export type ServerPaymentCreatePayload = z.output<typeof serverPaymentCreateSchema>
export type ServerListResponse = z.infer<typeof serverListResponseSchema>
export type ServerResponse = z.infer<typeof serverResponseSchema>
export type ServerDetailResponse = z.infer<typeof serverDetailResponseSchema>
