import { z } from 'zod'

import {
  blankToNull,
  currencySchema,
  idSchema,
  isoDateTimeSchema,
  optionalId,
  optionalMoneySchema,
  optionalText,
  optionalUrl,
  requiredText,
  tagsSchema,
} from './common'
import { invoiceSchema } from './invoices'

export const projectStatusSchema = z.enum(['DEVELOPMENT', 'ACTIVE', 'PAUSED', 'ARCHIVED'])
export const healthStatusSchema = z.enum(['UP', 'DOWN', 'UNKNOWN'])

export const projectSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Только латиница, цифры и дефис, например my-project')

export const projectHealthSchema = z.object({
  status: healthStatusSchema,
  checkedAt: isoDateTimeSchema.nullable(),
  latencyMs: z.number().int().nullable(),
  statusCode: z.number().int().nullable(),
  error: z.string().nullable(),
  sslExpiresAt: isoDateTimeSchema.nullable(),
  uptime24h: z.number().min(0).max(100).nullable(),
  uptime7d: z.number().min(0).max(100).nullable(),
})

export const projectRepoSchema = z.object({
  pushedAt: isoDateTimeSchema.nullable(),
  openIssues: z.number().int().nullable(),
  syncedAt: isoDateTimeSchema.nullable(),
})

export const projectRefSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
})

const relatedRefSchema = z.object({
  id: idSchema,
  name: z.string(),
})

export const projectSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  status: projectStatusSchema,
  repoUrl: z.string().nullable(),
  productionUrl: z.string().nullable(),
  healthCheckUrl: z.string().nullable(),
  clientId: idSchema.nullable(),
  serverId: idSchema.nullable(),
  client: relatedRefSchema.nullable(),
  server: relatedRefSchema.nullable(),
  monthlyFee: z.number().nullable(),
  currency: z.string(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  health: projectHealthSchema,
  repo: projectRepoSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

const projectFieldsSchema = z.object({
  name: requiredText(120),
  slug: z.preprocess(blankToNull, projectSlugSchema.nullable().optional()),
  description: optionalText(2000),
  status: projectStatusSchema,
  repoUrl: optionalUrl(),
  productionUrl: optionalUrl(),
  healthCheckUrl: optionalUrl(),
  clientId: optionalId(),
  serverId: optionalId(),
  monthlyFee: optionalMoneySchema,
  currency: currencySchema,
  tags: tagsSchema,
  notes: optionalText(5000),
})

export const projectCreateSchema = projectFieldsSchema.extend({
  status: projectStatusSchema.default('ACTIVE'),
  currency: currencySchema.default('KZT'),
  tags: tagsSchema.default([]),
})

// Defaults would silently reset fields on PATCH, so updates derive from the default-free base.
export const projectUpdateSchema = projectFieldsSchema.partial()

export const healthCheckRunSchema = z.object({
  id: idSchema,
  checkedAt: isoDateTimeSchema,
  ok: z.boolean(),
  statusCode: z.number().int().nullable(),
  latencyMs: z.number().int().nullable(),
  error: z.string().nullable(),
  sslExpiresAt: isoDateTimeSchema.nullable(),
})

export const projectListResponseSchema = z.object({
  projects: z.array(projectSchema),
})

export const projectResponseSchema = z.object({
  project: projectSchema,
})

export const projectDetailResponseSchema = z.object({
  project: projectSchema,
  healthRuns: z.array(healthCheckRunSchema),
  invoices: z.array(invoiceSchema),
})

export const healthCheckResponseSchema = z.object({
  project: projectSchema,
  run: healthCheckRunSchema,
})

export const healthRunAllResponseSchema = z.object({
  checked: z.number().int(),
  up: z.number().int(),
  down: z.number().int(),
})

export type ProjectStatus = z.infer<typeof projectStatusSchema>
export type HealthStatus = z.infer<typeof healthStatusSchema>
export type ProjectHealth = z.infer<typeof projectHealthSchema>
export type ProjectDto = z.infer<typeof projectSchema>
export type ProjectRef = z.infer<typeof projectRefSchema>
export type ProjectCreateInput = z.input<typeof projectCreateSchema>
export type ProjectCreatePayload = z.output<typeof projectCreateSchema>
export type ProjectUpdateInput = z.input<typeof projectUpdateSchema>
export type ProjectUpdatePayload = z.output<typeof projectUpdateSchema>
export type HealthCheckRunDto = z.infer<typeof healthCheckRunSchema>
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>
export type ProjectResponse = z.infer<typeof projectResponseSchema>
export type ProjectDetailResponse = z.infer<typeof projectDetailResponseSchema>
export type HealthCheckResponse = z.infer<typeof healthCheckResponseSchema>
export type HealthRunAllResponse = z.infer<typeof healthRunAllResponseSchema>
