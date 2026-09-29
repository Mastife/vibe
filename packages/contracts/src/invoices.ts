import { z } from 'zod'

import {
  currencySchema,
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  moneySchema,
  optionalDate,
  optionalId,
  optionalText,
  requiredText,
} from './common'

export const invoiceStatusSchema = z.enum(['DRAFT', 'SENT', 'PAID', 'CANCELLED'])

export const invoiceSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  clientName: z.string(),
  projectId: idSchema.nullable(),
  projectName: z.string().nullable(),
  title: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: invoiceStatusSchema,
  issuedAt: isoDateSchema,
  dueAt: isoDateSchema.nullable(),
  paidAt: isoDateSchema.nullable(),
  note: z.string().nullable(),
  isOverdue: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

const invoiceFieldsSchema = z.object({
  clientId: idSchema,
  projectId: optionalId(),
  title: requiredText(200),
  amount: moneySchema,
  currency: currencySchema,
  status: invoiceStatusSchema,
  issuedAt: optionalDate(),
  dueAt: optionalDate(),
  paidAt: optionalDate(),
  note: optionalText(2000),
})

export const invoiceCreateSchema = invoiceFieldsSchema.extend({
  currency: currencySchema.default('RUB'),
  status: invoiceStatusSchema.default('SENT'),
})

// Defaults would silently reset fields on PATCH, so updates derive from the default-free base.
export const invoiceUpdateSchema = invoiceFieldsSchema.partial()

export const invoiceListQuerySchema = z.object({
  status: invoiceStatusSchema.optional(),
  clientId: idSchema.optional(),
  projectId: idSchema.optional(),
})

export const invoiceListResponseSchema = z.object({
  invoices: z.array(invoiceSchema),
})

export const invoiceResponseSchema = z.object({
  invoice: invoiceSchema,
})

export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>
export type InvoiceDto = z.infer<typeof invoiceSchema>
export type InvoiceCreateInput = z.input<typeof invoiceCreateSchema>
export type InvoiceCreatePayload = z.output<typeof invoiceCreateSchema>
export type InvoiceUpdateInput = z.input<typeof invoiceUpdateSchema>
export type InvoiceUpdatePayload = z.output<typeof invoiceUpdateSchema>
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>
export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>
