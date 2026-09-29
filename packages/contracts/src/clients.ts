import { z } from 'zod'

import {
  blankToNull,
  idSchema,
  isoDateTimeSchema,
  moneyByCurrencySchema,
  optionalText,
  requiredText,
} from './common'

export const clientSchema = z.object({
  id: idSchema,
  name: z.string(),
  contactName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  telegram: z.string().nullable(),
  notes: z.string().nullable(),
  projectCount: z.number().int(),
  outstanding: z.array(moneyByCurrencySchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export const clientCreateSchema = z.object({
  name: requiredText(120),
  contactName: optionalText(120),
  email: z.preprocess(blankToNull, z.email().max(254).nullable().optional()),
  phone: optionalText(40),
  telegram: optionalText(64),
  notes: optionalText(5000),
})

export const clientUpdateSchema = clientCreateSchema.partial()

export const clientListResponseSchema = z.object({
  clients: z.array(clientSchema),
})

export const clientResponseSchema = z.object({
  client: clientSchema,
})

export type ClientDto = z.infer<typeof clientSchema>
export type ClientCreateInput = z.input<typeof clientCreateSchema>
export type ClientCreatePayload = z.output<typeof clientCreateSchema>
export type ClientUpdateInput = z.input<typeof clientUpdateSchema>
export type ClientUpdatePayload = z.output<typeof clientUpdateSchema>
export type ClientListResponse = z.infer<typeof clientListResponseSchema>
export type ClientResponse = z.infer<typeof clientResponseSchema>
