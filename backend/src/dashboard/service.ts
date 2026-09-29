import type { DashboardResponse, HealthStatus, InvoiceDto, ProjectDto } from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { DomainsService } from '../domains/service'
import type { InvoicesService } from '../invoices/service'
import { addDays, monthlyEquivalent, todayUtc } from '../lib/dates'
import { decimalToNumber, sumByCurrency } from '../lib/money'
import type { ProjectsService } from '../projects/service'
import type { ServersService } from '../servers/service'
import { buildAlerts } from './alerts'

const healthRank: Record<HealthStatus, number> = { DOWN: 0, UNKNOWN: 1, UP: 2 }

export class DashboardService {
  constructor(
    private readonly db: DbClient,
    private readonly projects: ProjectsService,
    private readonly servers: ServersService,
    private readonly invoices: InvoicesService,
    private readonly domains: DomainsService,
  ) {}

  async build(now = new Date()): Promise<DashboardResponse> {
    const [projects, servers, openInvoices, domains, paidRows] = await Promise.all([
      this.projects.list(now),
      this.servers.list(now),
      this.invoices.list({ status: 'SENT' }, now),
      this.domains.list(now),
      this.db.invoice.findMany({
        where: { status: 'PAID', paidAt: { gte: addDays(todayUtc(now), -30) } },
        select: { amount: true, currency: true },
      }),
    ])

    const alerts = buildAlerts({ projects, servers, openInvoices, domains, now })
    const liveProjects = projects.filter((project) => project.status !== 'ARCHIVED')
    const monitoredProjects = liveProjects
      .filter((project) => project.monitorTarget)
      .sort(compareProjectHealth)
    const activeServers = servers.filter((server) => server.status !== 'DECOMMISSIONED')

    return {
      generatedAt: now.toISOString(),
      projects: {
        total: projects.length,
        active: projects.filter((project) => project.status === 'ACTIVE').length,
        up: liveProjects.filter((project) => project.health.status === 'UP').length,
        down: liveProjects.filter((project) => project.health.status === 'DOWN').length,
        unknown: liveProjects.filter((project) => project.health.status === 'UNKNOWN').length,
      },
      servers: {
        total: servers.length,
        active: activeServers.length,
        overdue: activeServers.filter((server) => server.payment.state === 'OVERDUE').length,
        dueSoon: activeServers.filter((server) => server.payment.state === 'DUE_SOON').length,
        monthlyCost: sumByCurrency(
          activeServers.map((server) => ({
            currency: server.currency,
            amount: monthlyEquivalent(server.monthlyCost, server.billingPeriod),
          })),
        ),
      },
      invoices: {
        outstanding: sumByCurrency(openInvoices),
        overdueCount: openInvoices.filter((invoice) => invoice.isOverdue).length,
        dueSoonCount: alerts.filter((alert) => alert.kind === 'INVOICE_DUE').length,
        paidLast30Days: sumByCurrency(
          paidRows.map((row) => ({ currency: row.currency, amount: decimalToNumber(row.amount) })),
        ),
      },
      alerts,
      monitoredProjects,
      upcomingServerPayments: activeServers
        .filter((server) => server.paidUntil !== null)
        .sort((a, b) => a.paidUntil!.localeCompare(b.paidUntil!))
        .slice(0, 6),
      openInvoices: [...openInvoices].sort(compareOpenInvoices).slice(0, 8),
    }
  }
}

function compareProjectHealth(a: ProjectDto, b: ProjectDto) {
  const byHealth = healthRank[a.health.status] - healthRank[b.health.status]
  return byHealth !== 0 ? byHealth : a.name.localeCompare(b.name, 'ru')
}

function compareOpenInvoices(a: InvoiceDto, b: InvoiceDto) {
  if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
  if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt)
  if (a.dueAt) return -1
  if (b.dueAt) return 1
  return b.issuedAt.localeCompare(a.issuedAt)
}
