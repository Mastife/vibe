import { z } from 'zod'

import { idSchema, isoDateSchema, isoDateTimeSchema, moneyByCurrencySchema } from './common'
import { invoiceSchema } from './invoices'
import { projectSchema } from './projects'
import { serverSchema } from './servers'

export const alertSeveritySchema = z.enum(['critical', 'warning', 'info'])

export const alertKindSchema = z.enum([
  'PROJECT_DOWN',
  'SSL_EXPIRING',
  'SERVER_PAYMENT_OVERDUE',
  'SERVER_PAYMENT_DUE',
  'INVOICE_OVERDUE',
  'INVOICE_DUE',
  'DOMAIN_EXPIRED',
  'DOMAIN_EXPIRING',
  'PILOT_ENDING',
  'PILOT_DECISION_OVERDUE',
  'PROJECTS_UNMONITORED',
])

export const alertEntityTypeSchema = z.enum(['project', 'server', 'invoice', 'domain', 'projects'])

export const alertSchema = z.object({
  id: z.string(),
  severity: alertSeveritySchema,
  kind: alertKindSchema,
  title: z.string(),
  description: z.string(),
  entityType: alertEntityTypeSchema,
  entityId: idSchema.nullable(),
  dueAt: isoDateSchema.nullable(),
})

export const dashboardResponseSchema = z.object({
  generatedAt: isoDateTimeSchema,
  projects: z.object({
    total: z.number().int(),
    active: z.number().int(),
    up: z.number().int(),
    down: z.number().int(),
    unknown: z.number().int(),
  }),
  servers: z.object({
    total: z.number().int(),
    active: z.number().int(),
    overdue: z.number().int(),
    dueSoon: z.number().int(),
    monthlyCost: z.array(moneyByCurrencySchema),
  }),
  invoices: z.object({
    outstanding: z.array(moneyByCurrencySchema),
    overdueCount: z.number().int(),
    dueSoonCount: z.number().int(),
    paidLast30Days: z.array(moneyByCurrencySchema),
  }),
  alerts: z.array(alertSchema),
  monitoredProjects: z.array(projectSchema),
  upcomingServerPayments: z.array(serverSchema),
  openInvoices: z.array(invoiceSchema),
})

export type AlertSeverity = z.infer<typeof alertSeveritySchema>
export type AlertKind = z.infer<typeof alertKindSchema>
export type AlertDto = z.infer<typeof alertSchema>
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>
