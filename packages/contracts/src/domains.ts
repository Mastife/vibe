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
} from './common'
import { projectRefSchema } from './projects'
import { paymentStateSchema } from './servers'

/** Lowercase host name such as `navigo.help` or `menu.brofood.kz`; no scheme, path, or port. */
export const domainNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/, 'Домен вида example.kz, без https:// и пути')

export const domainSchema = z.object({
  id: idSchema,
  name: z.string(),
  registrar: z.string().nullable(),
  projectId: idSchema.nullable(),
  project: projectRefSchema.nullable(),
  expiresAt: isoDateSchema.nullable(),
  renewalCost: z.number(),
  currency: z.string(),
  notes: z.string().nullable(),
  expirySyncedAt: isoDateTimeSchema.nullable(),
  /** Same bands as server payments: due soon within 30 days for domains. */
  renewal: z.object({
    state: paymentStateSchema,
    daysLeft: z.number().int().nullable(),
  }),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

const domainFieldsSchema = z.object({
  name: domainNameSchema,
  registrar: optionalText(120),
  projectId: optionalId(),
  expiresAt: optionalDate(),
  renewalCost: moneySchema,
  currency: currencySchema,
  notes: optionalText(2000),
})

export const domainCreateSchema = domainFieldsSchema.extend({
  renewalCost: moneySchema.default(0),
  currency: currencySchema.default('KZT'),
})

// Defaults would silently reset fields on PATCH, so updates derive from the default-free base.
export const domainUpdateSchema = domainFieldsSchema.partial()

export const domainListResponseSchema = z.object({
  domains: z.array(domainSchema),
})

export const domainResponseSchema = z.object({
  domain: domainSchema,
})

export const domainSyncResponseSchema = z.object({
  checked: z.number().int(),
  updated: z.number().int(),
  failed: z.number().int(),
})

export type DomainDto = z.infer<typeof domainSchema>
export type DomainCreateInput = z.input<typeof domainCreateSchema>
export type DomainCreatePayload = z.output<typeof domainCreateSchema>
export type DomainUpdateInput = z.input<typeof domainUpdateSchema>
export type DomainUpdatePayload = z.output<typeof domainUpdateSchema>
export type DomainListResponse = z.infer<typeof domainListResponseSchema>
export type DomainResponse = z.infer<typeof domainResponseSchema>
export type DomainSyncResponse = z.infer<typeof domainSyncResponseSchema>
