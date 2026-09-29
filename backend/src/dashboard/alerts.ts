import type { AlertDto, AlertSeverity, DomainDto, InvoiceDto, ProjectDto, ServerDto } from '@projects-hq/contracts'

import { daysBetween, parseDateOnly, toDateOnly, todayUtc } from '../lib/dates'
import { formatDays, formatMoney, plural } from '../lib/text'

export type AlertInput = {
  projects: ProjectDto[]
  servers: ServerDto[]
  openInvoices: InvoiceDto[]
  domains?: DomainDto[]
  now: Date
}

export const alertThresholds = {
  serverDueSoonDays: 7,
  invoiceDueSoonDays: 3,
  sslExpiringDays: 14,
  sslCriticalDays: 3,
  domainExpiringDays: 30,
  domainCriticalDays: 7,
}

const severityRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

/** Pure derivation of everything that needs the owner's attention today. */
export function buildAlerts({ projects, servers, openInvoices, domains = [], now }: AlertInput): AlertDto[] {
  const today = todayUtc(now)
  const alerts: AlertDto[] = []
  const liveProjects = projects.filter((project) => project.status !== 'ARCHIVED')

  for (const project of liveProjects) {
    if (project.health.status === 'DOWN') {
      alerts.push({
        id: `project-down-${project.id}`,
        severity: 'critical',
        kind: 'PROJECT_DOWN',
        title: `${project.name} недоступен`,
        description: project.health.error ?? 'Проверка доступности не прошла',
        entityType: 'project',
        entityId: project.id,
        dueAt: null,
      })
    }

    if (project.health.sslExpiresAt) {
      const expiresAt = new Date(project.health.sslExpiresAt)
      const days = daysBetween(today, expiresAt)
      if (days <= alertThresholds.sslExpiringDays) {
        alerts.push({
          id: `ssl-${project.id}`,
          severity: days <= alertThresholds.sslCriticalDays ? 'critical' : 'warning',
          kind: 'SSL_EXPIRING',
          title:
            days < 0
              ? `SSL-сертификат ${project.name} истёк`
              : days === 0
                ? `SSL-сертификат ${project.name} истекает сегодня`
                : `SSL-сертификат ${project.name} истекает через ${formatDays(days)}`,
          description: `Действителен до ${toDateOnly(expiresAt)}`,
          entityType: 'project',
          entityId: project.id,
          dueAt: toDateOnly(expiresAt),
        })
      }
    }
  }

  for (const project of liveProjects) {
    const pilot = project.pilot
    if (!pilot.endsAt || pilot.daysLeft === null) continue
    const client = project.client ? ` (${project.client.name})` : ''
    if (pilot.state === 'AWAITING_DECISION') {
      alerts.push({
        id: `pilot-${project.id}`,
        severity: 'critical',
        kind: 'PILOT_DECISION_OVERDUE',
        title: `Пилот ${project.name}${client} закончился ${formatDays(-pilot.daysLeft)} назад — решение не принято`,
        description: `Пилот до ${pilot.endsAt}. Отметьте решение клиента в карточке проекта.`,
        entityType: 'project',
        entityId: project.id,
        dueAt: pilot.endsAt,
      })
    } else if (pilot.state === 'ENDING') {
      alerts.push({
        id: `pilot-${project.id}`,
        severity: 'warning',
        kind: 'PILOT_ENDING',
        title:
          pilot.daysLeft === 0
            ? `Пилот ${project.name}${client} заканчивается сегодня`
            : `Пилот ${project.name}${client} заканчивается через ${formatDays(pilot.daysLeft)}`,
        description: `Пилот до ${pilot.endsAt}. Пора обсудить с клиентом продолжение.`,
        entityType: 'project',
        entityId: project.id,
        dueAt: pilot.endsAt,
      })
    }
  }

  const unmonitored = liveProjects.filter((project) => !project.monitorTarget)
  if (unmonitored.length > 0) {
    const names = unmonitored.slice(0, 5).map((project) => project.name)
    const rest = unmonitored.length - names.length
    alerts.push({
      id: 'projects-unmonitored',
      severity: 'info',
      kind: 'PROJECTS_UNMONITORED',
      title: `Без мониторинга: ${unmonitored.length} ${plural(unmonitored.length, ['проект', 'проекта', 'проектов'])}`,
      description: `${names.join(', ')}${rest > 0 ? ` и ещё ${rest}` : ''}. Добавьте адрес продакшена, чтобы следить за доступностью.`,
      entityType: 'projects',
      entityId: null,
      dueAt: null,
    })
  }

  for (const server of servers) {
    if (server.status === 'DECOMMISSIONED' || !server.paidUntil) continue
    const days = server.payment.daysLeft ?? daysBetween(today, parseDateOnly(server.paidUntil))
    const cost = `${formatMoney(server.monthlyCost, server.currency)} за период`

    if (days < 0) {
      alerts.push({
        id: `server-overdue-${server.id}`,
        severity: 'critical',
        kind: 'SERVER_PAYMENT_OVERDUE',
        title: `Сервер ${server.name}: оплата просрочена на ${formatDays(-days)}`,
        description: `Оплачен до ${server.paidUntil}. ${cost}`,
        entityType: 'server',
        entityId: server.id,
        dueAt: server.paidUntil,
      })
    } else if (days <= alertThresholds.serverDueSoonDays) {
      alerts.push({
        id: `server-due-${server.id}`,
        severity: 'warning',
        kind: 'SERVER_PAYMENT_DUE',
        title:
          days === 0
            ? `Сервер ${server.name}: оплатить сегодня`
            : `Сервер ${server.name}: оплата через ${formatDays(days)}`,
        description: `Оплачен до ${server.paidUntil}. ${cost}`,
        entityType: 'server',
        entityId: server.id,
        dueAt: server.paidUntil,
      })
    }
  }

  for (const invoice of openInvoices) {
    if (invoice.status !== 'SENT' || !invoice.dueAt) continue
    const days = daysBetween(today, parseDateOnly(invoice.dueAt))
    const amount = `${invoice.clientName}: ${formatMoney(invoice.amount, invoice.currency)}`

    if (days < 0) {
      alerts.push({
        id: `invoice-overdue-${invoice.id}`,
        severity: 'warning',
        kind: 'INVOICE_OVERDUE',
        title: `Счёт «${invoice.title}» просрочен на ${formatDays(-days)}`,
        description: amount,
        entityType: 'invoice',
        entityId: invoice.id,
        dueAt: invoice.dueAt,
      })
    } else if (days <= alertThresholds.invoiceDueSoonDays) {
      alerts.push({
        id: `invoice-due-${invoice.id}`,
        severity: 'info',
        kind: 'INVOICE_DUE',
        title:
          days === 0
            ? `Счёт «${invoice.title}» к оплате сегодня`
            : `Счёт «${invoice.title}» к оплате через ${formatDays(days)}`,
        description: amount,
        entityType: 'invoice',
        entityId: invoice.id,
        dueAt: invoice.dueAt,
      })
    }
  }

  for (const domain of domains) {
    if (!domain.expiresAt) continue
    const days = daysBetween(today, parseDateOnly(domain.expiresAt))
    if (days > alertThresholds.domainExpiringDays) continue
    const cost = domain.renewalCost > 0 ? ` Продление: ${formatMoney(domain.renewalCost, domain.currency)}` : ''
    alerts.push({
      id: `domain-${domain.id}`,
      severity: days <= alertThresholds.domainCriticalDays ? 'critical' : 'warning',
      kind: days < 0 ? 'DOMAIN_EXPIRED' : 'DOMAIN_EXPIRING',
      title:
        days < 0
          ? `Домен ${domain.name} истёк ${formatDays(-days)} назад`
          : days === 0
            ? `Домен ${domain.name} истекает сегодня`
            : `Домен ${domain.name} истекает через ${formatDays(days)}`,
      description: `Оплачен до ${domain.expiresAt}.${cost}`,
      entityType: 'domain',
      entityId: domain.id,
      dueAt: domain.expiresAt,
    })
  }

  return alerts.sort(compareAlerts)
}

function compareAlerts(a: AlertDto, b: AlertDto) {
  const bySeverity = severityRank[a.severity] - severityRank[b.severity]
  if (bySeverity !== 0) return bySeverity
  if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt.localeCompare(b.dueAt)
  if (a.dueAt && !b.dueAt) return -1
  if (!a.dueAt && b.dueAt) return 1
  return a.title.localeCompare(b.title, 'ru')
}
