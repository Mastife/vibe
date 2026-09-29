import { z } from 'zod'

import { idSchema, isoDateSchema, isoDateTimeSchema } from './common'
import { healthStatusSchema, projectStatusSchema } from './projects'
import { paymentStateSchema } from './servers'

/** `YYYY-MM` calendar month (UTC). */
export const isoMonthSchema = z.string().regex(/^\d{4}-\d{2}$/)

export const analyticsDaySchema = z.object({
  date: isoDateSchema,
  /** Share of successful checks across all monitored projects, 0-100; null when nothing was checked that day. */
  uptime: z.number().min(0).max(100).nullable(),
  checks: z.number().int(),
  failures: z.number().int(),
})

export const analyticsProjectHealthSchema = z.object({
  id: idSchema,
  name: z.string(),
  status: healthStatusSchema,
  uptime24h: z.number().min(0).max(100).nullable(),
  uptime7d: z.number().min(0).max(100).nullable(),
  avgLatencyMs: z.number().int().nullable(),
  sslDaysLeft: z.number().int().nullable(),
  /** Uptime per day, aligned with `health.days`; null when the project was not checked that day. */
  daily: z.array(z.number().min(0).max(100).nullable()),
})

export const analyticsServerCostSchema = z.object({
  id: idSchema,
  name: z.string(),
  monthlyCost: z.number(),
  paidUntil: isoDateSchema.nullable(),
  daysLeft: z.number().int().nullable(),
  paymentState: paymentStateSchema,
  projectCount: z.number().int(),
})

export const analyticsMonthSchema = z.object({
  month: isoMonthSchema,
  /** Paid invoices by payment date. */
  income: z.number(),
  /** Recorded server payments by payment date. */
  expenses: z.number(),
})

export const analyticsForecastMonthSchema = z.object({
  month: isoMonthSchema,
  /** Server renewals falling due in this month, from `paidUntil` and the billing period. */
  serverPayments: z.number(),
  renewals: z.number().int(),
})

export const analyticsClientDebtSchema = z.object({
  clientId: idSchema,
  name: z.string(),
  overdue: z.number(),
  current: z.number(),
})

export const analyticsResponseSchema = z.object({
  generatedAt: isoDateTimeSchema,
  /** The panel works in a single currency; every amount below is in it. */
  currency: z.string(),
  health: z.object({
    days: z.array(isoDateSchema),
    daily: z.array(analyticsDaySchema),
    uptime7d: z.number().min(0).max(100).nullable(),
    avgLatencyMs: z.number().int().nullable(),
    statusCounts: z.object({ up: z.number().int(), down: z.number().int(), unknown: z.number().int() }),
    lifecycle: z.array(z.object({ status: projectStatusSchema, count: z.number().int() })),
    projects: z.array(analyticsProjectHealthSchema),
  }),
  finance: z.object({
    monthlyCost: z.number(),
    monthlyRevenue: z.number(),
    outstanding: z.number(),
    overdue: z.number(),
    servers: z.array(analyticsServerCostSchema),
    months: z.array(analyticsMonthSchema),
    forecast: z.array(analyticsForecastMonthSchema),
    clientDebts: z.array(analyticsClientDebtSchema),
  }),
})

export type AnalyticsDay = z.infer<typeof analyticsDaySchema>
export type AnalyticsProjectHealth = z.infer<typeof analyticsProjectHealthSchema>
export type AnalyticsServerCost = z.infer<typeof analyticsServerCostSchema>
export type AnalyticsMonth = z.infer<typeof analyticsMonthSchema>
export type AnalyticsForecastMonth = z.infer<typeof analyticsForecastMonthSchema>
export type AnalyticsClientDebt = z.infer<typeof analyticsClientDebtSchema>
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>
