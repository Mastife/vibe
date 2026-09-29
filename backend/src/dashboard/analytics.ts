import type {
  AnalyticsClientDebt,
  AnalyticsForecastMonth,
  AnalyticsMonth,
  AnalyticsProjectHealth,
  AnalyticsResponse,
  InvoiceDto,
  ProjectDto,
  ProjectStatus,
  ServerDto,
} from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { InvoicesService } from '../invoices/service'
import { addBillingPeriods, addDays, daysBetween, monthlyEquivalent, parseDateOnly, toDateOnly, todayUtc } from '../lib/dates'
import { decimalToNumber, roundMoney } from '../lib/money'
import type { ProjectsService } from '../projects/service'
import type { ServersService } from '../servers/service'

/** The panel works in tenge only; rows in any other currency are left out of the totals. */
export const PANEL_CURRENCY = 'KZT'
export const HEALTH_DAYS = 14
export const HISTORY_MONTHS = 12
export const FORECAST_MONTHS = 6

const lifecycleOrder: ProjectStatus[] = ['ACTIVE', 'DEVELOPMENT', 'PAUSED', 'ARCHIVED']

export type DailyHealthRow = {
  projectId: string
  day: Date
  total: number
  ok: number
  latencySum: number | null
  latencyCount: number
}

export type MoneyEvent = { amount: number; currency: string; paidAt: Date }

export type AnalyticsInput = {
  now: Date
  projects: ProjectDto[]
  servers: ServerDto[]
  openInvoices: InvoiceDto[]
  dailyHealth: DailyHealthRow[]
  paidInvoices: MoneyEvent[]
  serverPayments: MoneyEvent[]
}

/** Pure aggregation behind the analytics dashboards; the service only loads rows. */
export function buildAnalytics(input: AnalyticsInput): AnalyticsResponse {
  const { now } = input
  const today = todayUtc(now)
  const days = Array.from({ length: HEALTH_DAYS }, (_, index) => toDateOnly(addDays(today, index - HEALTH_DAYS + 1)))
  const liveProjects = input.projects.filter((project) => project.status !== 'ARCHIVED')
  const monitored = liveProjects.filter((project) => project.productionUrl || project.healthCheckUrl)
  const monitoredIds = new Set(monitored.map((project) => project.id))
  const healthRows = input.dailyHealth.filter((row) => monitoredIds.has(row.projectId))

  const byProjectDay = new Map<string, DailyHealthRow>()
  for (const row of healthRows) byProjectDay.set(`${row.projectId}:${toDateOnly(row.day)}`, row)

  const daily = days.map((date) => {
    const rows = healthRows.filter((row) => toDateOnly(row.day) === date)
    const checks = sum(rows.map((row) => row.total))
    const ok = sum(rows.map((row) => row.ok))
    return { date, uptime: percent(ok, checks), checks, failures: checks - ok }
  })

  const projects: AnalyticsProjectHealth[] = monitored
    .map((project) => {
      const rows = healthRows.filter((row) => row.projectId === project.id)
      const latencyCount = sum(rows.map((row) => row.latencyCount))
      const sslExpiresAt = project.health.sslExpiresAt
      return {
        id: project.id,
        name: project.name,
        status: project.health.status,
        uptime24h: project.health.uptime24h,
        uptime7d: project.health.uptime7d,
        avgLatencyMs: latencyCount > 0 ? Math.round(sum(rows.map((row) => row.latencySum ?? 0)) / latencyCount) : null,
        sslDaysLeft: sslExpiresAt ? daysBetween(now, new Date(sslExpiresAt)) : null,
        daily: days.map((date) => {
          const row = byProjectDay.get(`${project.id}:${date}`)
          return row ? percent(row.ok, row.total) : null
        }),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  const weekRows = healthRows.filter((row) => daysBetween(row.day, today) < 7)
  const weekChecks = sum(weekRows.map((row) => row.total))
  const allLatencyCount = sum(healthRows.map((row) => row.latencyCount))

  const activeServers = input.servers.filter((server) => server.status !== 'DECOMMISSIONED' && server.currency === PANEL_CURRENCY)
  const openInvoices = input.openInvoices.filter((invoice) => invoice.currency === PANEL_CURRENCY)

  return {
    generatedAt: now.toISOString(),
    currency: PANEL_CURRENCY,
    health: {
      days,
      daily,
      uptime7d: percent(sum(weekRows.map((row) => row.ok)), weekChecks),
      avgLatencyMs:
        allLatencyCount > 0 ? Math.round(sum(healthRows.map((row) => row.latencySum ?? 0)) / allLatencyCount) : null,
      statusCounts: {
        up: monitored.filter((project) => project.health.status === 'UP').length,
        down: monitored.filter((project) => project.health.status === 'DOWN').length,
        unknown: monitored.filter((project) => project.health.status === 'UNKNOWN').length,
      },
      lifecycle: lifecycleOrder.map((status) => ({
        status,
        count: input.projects.filter((project) => project.status === status).length,
      })),
      projects,
    },
    finance: {
      monthlyCost: roundMoney(
        sum(activeServers.map((server) => monthlyEquivalent(server.monthlyCost, server.billingPeriod))),
      ),
      monthlyRevenue: roundMoney(
        sum(
          liveProjects
            .filter((project) => project.currency === PANEL_CURRENCY)
            .map((project) => project.monthlyFee ?? 0),
        ),
      ),
      outstanding: roundMoney(sum(openInvoices.map((invoice) => invoice.amount))),
      overdue: roundMoney(sum(openInvoices.filter((invoice) => invoice.isOverdue).map((invoice) => invoice.amount))),
      servers: activeServers
        .filter((server) => server.monthlyCost > 0)
        .map((server) => ({
          id: server.id,
          name: server.name,
          monthlyCost: roundMoney(monthlyEquivalent(server.monthlyCost, server.billingPeriod)),
          paidUntil: server.paidUntil,
          daysLeft: server.payment.daysLeft,
          paymentState: server.payment.state,
          projectCount: server.projects.length,
        }))
        .sort((a, b) => b.monthlyCost - a.monthlyCost || a.name.localeCompare(b.name, 'ru')),
      months: buildMonths(input, today),
      forecast: buildForecast(activeServers, today),
      clientDebts: buildClientDebts(openInvoices),
    },
  }
}

function buildMonths(input: AnalyticsInput, today: Date): AnalyticsMonth[] {
  const months = monthRange(today, -(HISTORY_MONTHS - 1), HISTORY_MONTHS)
  const income = bucketByMonth(input.paidInvoices)
  const expenses = bucketByMonth(input.serverPayments)
  return months.map((month) => ({
    month,
    income: roundMoney(income.get(month) ?? 0),
    expenses: roundMoney(expenses.get(month) ?? 0),
  }))
}

/** Walks each server's renewal dates forward; overdue renewals count in the current month. */
function buildForecast(servers: ServerDto[], today: Date): AnalyticsForecastMonth[] {
  const months = monthRange(today, 0, FORECAST_MONTHS)
  const totals = new Map(months.map((month) => [month, { serverPayments: 0, renewals: 0 }]))
  const horizon = parseDateOnly(`${months.at(-1)}-01`)
  const horizonEnd = new Date(Date.UTC(horizon.getUTCFullYear(), horizon.getUTCMonth() + 1, 1))

  for (const server of servers) {
    if (!server.paidUntil || server.monthlyCost <= 0) continue
    let due = parseDateOnly(server.paidUntil)
    while (due < horizonEnd) {
      const month = due < today ? months[0]! : toMonth(due)
      const bucket = totals.get(month)
      if (bucket) {
        bucket.serverPayments += server.monthlyCost
        bucket.renewals += 1
      }
      due = addBillingPeriods(due, server.billingPeriod, 1)
    }
  }

  return months.map((month) => {
    const bucket = totals.get(month)!
    return { month, serverPayments: roundMoney(bucket.serverPayments), renewals: bucket.renewals }
  })
}

function buildClientDebts(invoices: InvoiceDto[]): AnalyticsClientDebt[] {
  const debts = new Map<string, AnalyticsClientDebt>()
  for (const invoice of invoices) {
    const debt = debts.get(invoice.clientId) ?? { clientId: invoice.clientId, name: invoice.clientName, overdue: 0, current: 0 }
    if (invoice.isOverdue) debt.overdue += invoice.amount
    else debt.current += invoice.amount
    debts.set(invoice.clientId, debt)
  }
  return [...debts.values()]
    .map((debt) => ({ ...debt, overdue: roundMoney(debt.overdue), current: roundMoney(debt.current) }))
    .sort((a, b) => b.overdue + b.current - (a.overdue + a.current))
}

function bucketByMonth(events: MoneyEvent[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const event of events) {
    if (event.currency !== PANEL_CURRENCY) continue
    const month = toMonth(event.paidAt)
    totals.set(month, (totals.get(month) ?? 0) + event.amount)
  }
  return totals
}

function monthRange(today: Date, offset: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    toMonth(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset + index, 1))),
  )
}

function toMonth(date: Date): string {
  return toDateOnly(date).slice(0, 7)
}

function percent(ok: number, total: number): number | null {
  return total > 0 ? Math.round((ok / total) * 1000) / 10 : null
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

export class AnalyticsService {
  constructor(
    private readonly db: DbClient,
    private readonly projects: ProjectsService,
    private readonly servers: ServersService,
    private readonly invoices: InvoicesService,
  ) {}

  async build(now = new Date()): Promise<AnalyticsResponse> {
    const today = todayUtc(now)
    const healthSince = addDays(today, -(HEALTH_DAYS - 1))
    const moneySince = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (HISTORY_MONTHS - 1), 1))

    const [projects, servers, openInvoices, dailyHealth, paidInvoices, serverPayments] = await Promise.all([
      this.projects.list(now),
      this.servers.list(now),
      this.invoices.list({ status: 'SENT' }, now),
      this.db.$queryRaw<DailyHealthRow[]>`
        SELECT project_id::text AS "projectId",
               date_trunc('day', checked_at) AS day,
               count(*)::int AS total,
               (count(*) FILTER (WHERE ok))::int AS ok,
               (sum(latency_ms) FILTER (WHERE ok))::float8 AS "latencySum",
               (count(latency_ms) FILTER (WHERE ok))::int AS "latencyCount"
        FROM health_check_runs
        WHERE checked_at >= ${healthSince}
        GROUP BY 1, 2`,
      this.db.invoice.findMany({
        where: { status: 'PAID', paidAt: { gte: moneySince } },
        select: { amount: true, currency: true, paidAt: true },
      }),
      this.db.serverPayment.findMany({
        where: { paidAt: { gte: moneySince } },
        select: { amount: true, currency: true, paidAt: true },
      }),
    ])

    return buildAnalytics({
      now,
      projects,
      servers,
      openInvoices,
      dailyHealth,
      paidInvoices: paidInvoices
        .filter((row) => row.paidAt !== null)
        .map((row) => ({ amount: decimalToNumber(row.amount), currency: row.currency, paidAt: row.paidAt! })),
      serverPayments: serverPayments.map((row) => ({
        amount: decimalToNumber(row.amount),
        currency: row.currency,
        paidAt: row.paidAt,
      })),
    })
  }
}
