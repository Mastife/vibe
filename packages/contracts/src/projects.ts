import { z } from 'zod'

import {
  blankToNull,
  currencySchema,
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  optionalDate,
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

/** Client decision after the pilot; null while still open. */
export const pilotOutcomeSchema = z.enum(['CONTINUE', 'DECLINE'])

/**
 * NONE: no pilot. ACTIVE: running. ENDING: ends within a week, decision pending.
 * AWAITING_DECISION: ended without a decision. DECIDED: outcome recorded.
 */
export const pilotStateSchema = z.enum(['NONE', 'ACTIVE', 'ENDING', 'AWAITING_DECISION', 'DECIDED'])

export const projectPilotSchema = z.object({
  startsAt: isoDateSchema.nullable(),
  endsAt: isoDateSchema.nullable(),
  outcome: pilotOutcomeSchema.nullable(),
  state: pilotStateSchema,
  daysLeft: z.number().int().nullable(),
  /** Auto-invoicing waits while the pilot runs and until the client decides to continue. */
  blocksInvoicing: z.boolean(),
})

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
  sshHost: z.string().nullable(),
  dockerContainer: z.string().nullable(),
  /** What the monitor probes: the site (health-check URL, else production URL) plus the Docker container when set. */
  monitorTarget: z.string().nullable(),
  clientId: idSchema.nullable(),
  serverId: idSchema.nullable(),
  client: relatedRefSchema.nullable(),
  server: relatedRefSchema.nullable(),
  monthlyFee: z.number().nullable(),
  currency: z.string(),
  autoInvoice: z.boolean(),
  billingDay: z.number().int(),
  pilot: projectPilotSchema,
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  health: projectHealthSchema,
  repo: projectRepoSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

/** Day of month the subscription invoice goes out; capped at 28 so every month has it. */
export const billingDaySchema = z.coerce
  .number()
  .int()
  .min(1, 'День от 1 до 28')
  .max(28, 'День от 1 до 28')

function pilotDatesInOrder(value: { pilotStartsAt?: string | null; pilotEndsAt?: string | null }) {
  return !value.pilotStartsAt || !value.pilotEndsAt || value.pilotStartsAt <= value.pilotEndsAt
}

/** Host and container only make sense together; a PATCH that sends one of them must send both. */
function dockerTargetComplete(value: { sshHost?: string | null; dockerContainer?: string | null }) {
  if (value.sshHost === undefined && value.dockerContainer === undefined) return true
  return Boolean(value.sshHost) === Boolean(value.dockerContainer)
}

const dockerTargetIssue = { message: 'Укажите и SSH-хост, и имя контейнера — или оставьте оба пустыми', path: ['dockerContainer'] }

const pilotDatesIssue = { message: 'Пилот не может закончиться раньше, чем начался', path: ['pilotEndsAt'] }

const projectFieldsSchema = z.object({
  name: requiredText(120),
  slug: z.preprocess(blankToNull, projectSlugSchema.nullable().optional()),
  description: optionalText(2000),
  status: projectStatusSchema,
  repoUrl: optionalUrl(),
  productionUrl: optionalUrl(),
  healthCheckUrl: optionalUrl(),
  sshHost: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9.-]+$/, 'SSH-хост вида user@1.2.3.4 или user@server.kz')
      .max(255)
      .nullable()
      .optional(),
  ),
  dockerContainer: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'Имя контейнера: латиница, цифры, точка, дефис, подчёркивание')
      .max(128)
      .nullable()
      .optional(),
  ),
  clientId: optionalId(),
  serverId: optionalId(),
  monthlyFee: optionalMoneySchema,
  currency: currencySchema,
  /** Monthly subscription invoice to the client, issued on `billingDay`; needs a client and a monthly fee. */
  autoInvoice: z.boolean(),
  billingDay: billingDaySchema,
  pilotStartsAt: optionalDate(),
  pilotEndsAt: optionalDate(),
  pilotOutcome: z.preprocess(blankToNull, pilotOutcomeSchema.nullable().optional()),
  tags: tagsSchema,
  notes: optionalText(5000),
})

export const projectCreateSchema = projectFieldsSchema.extend({
  status: projectStatusSchema.default('ACTIVE'),
  currency: currencySchema.default('KZT'),
  autoInvoice: z.boolean().default(false),
  billingDay: billingDaySchema.default(1),
  tags: tagsSchema.default([]),
})
  .refine(pilotDatesInOrder, pilotDatesIssue)
  .refine(dockerTargetComplete, dockerTargetIssue)

// Defaults would silently reset fields on PATCH, so updates derive from the default-free base.
export const projectUpdateSchema = projectFieldsSchema
  .partial()
  .refine(pilotDatesInOrder, pilotDatesIssue)
  .refine(dockerTargetComplete, dockerTargetIssue)

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
export type PilotOutcome = z.infer<typeof pilotOutcomeSchema>
export type PilotState = z.infer<typeof pilotStateSchema>
export type ProjectPilot = z.infer<typeof projectPilotSchema>
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
