import type { DomainDto, InvoiceDto, ProjectDto, ServerDto, TaskDto } from '@projects-hq/contracts'

import type { DbClient } from '../db'
import type { DomainsService } from '../domains/service'
import type { InvoicesService } from '../invoices/service'
import type { ProjectsService } from '../projects/service'
import { addDays, daysBetween, parseDateOnly, todayUtc } from '../lib/dates'
import { formatDateLong, formatDays, formatMoney } from '../lib/text'
import type { ServersService } from '../servers/service'
import type { TasksService } from '../tasks/service'
import { escapeHtml, type Notifier } from './telegram'

export type ReminderKind = 'SERVER_PAYMENT' | 'DOMAIN_RENEWAL' | 'INVOICE_DUE' | 'PILOT_END' | 'TASK_DUE'

/** Days before the due date at which a reminder fires; -1 marks the one-off "overdue" reminder. */
export const reminderThresholds: Record<ReminderKind, number[]> = {
  SERVER_PAYMENT: [7, 3, 1, 0],
  DOMAIN_RENEWAL: [30, 7, 1, 0],
  INVOICE_DUE: [3, 1, 0],
  PILOT_END: [7, 3, 1, 0],
  TASK_DUE: [1, 0],
}

export type ReminderCandidate = {
  kind: ReminderKind
  entityId: string
  dueAt: string
  daysLeft: number
  threshold: number
  label: string
  amount: string | null
}

/**
 * The tightest threshold the item has crossed, or null while it is still far away. Picking the
 * tightest one means a worker that was offline for days sends one current reminder, not a backlog.
 */
export function reminderThreshold(daysLeft: number, thresholds: number[]): number | null {
  if (daysLeft < 0) return -1
  const crossed = thresholds.filter((threshold) => daysLeft <= threshold)
  return crossed.length > 0 ? Math.min(...crossed) : null
}

export function collectReminders(input: {
  projects?: ProjectDto[]
  servers: ServerDto[]
  domains: DomainDto[]
  invoices: InvoiceDto[]
  tasks?: TaskDto[]
  now: Date
}): ReminderCandidate[] {
  const today = todayUtc(input.now)
  const candidates: ReminderCandidate[] = []
  const push = (
    kind: ReminderKind,
    entityId: string,
    dueAt: string,
    label: string,
    amount: string | null,
  ) => {
    const daysLeft = daysBetween(today, parseDateOnly(dueAt))
    const threshold = reminderThreshold(daysLeft, reminderThresholds[kind])
    if (threshold !== null) candidates.push({ kind, entityId, dueAt, daysLeft, threshold, label, amount })
  }

  for (const server of input.servers) {
    if (server.status === 'DECOMMISSIONED' || !server.paidUntil || server.monthlyCost <= 0) continue
    push('SERVER_PAYMENT', server.id, server.paidUntil, `Сервер ${server.name}`, formatMoney(server.monthlyCost, server.currency))
  }
  for (const domain of input.domains) {
    if (!domain.expiresAt) continue
    const amount = domain.renewalCost > 0 ? formatMoney(domain.renewalCost, domain.currency) : null
    push('DOMAIN_RENEWAL', domain.id, domain.expiresAt, `Домен ${domain.name}`, amount)
  }
  for (const invoice of input.invoices) {
    if (invoice.status !== 'SENT' || !invoice.dueAt) continue
    push(
      'INVOICE_DUE',
      invoice.id,
      invoice.dueAt,
      `${invoice.clientName}: счёт «${invoice.title}»`,
      formatMoney(invoice.amount, invoice.currency),
    )
  }

  for (const project of input.projects ?? []) {
    const pilot = project.pilot
    // Only an undecided pilot needs a nudge; recording the outcome silences it.
    if (project.status === 'ARCHIVED' || pilot.outcome || !pilot.endsAt) continue
    const client = project.client ? ` (${project.client.name})` : ''
    push('PILOT_END', project.id, pilot.endsAt, `Пилот ${project.name}${client}`, null)
  }

  for (const task of input.tasks ?? []) {
    if (task.status === 'DONE' || !task.dueAt) continue
    push('TASK_DUE', task.id, task.dueAt, `Задача «${task.title}» (${task.project.name})`, null)
  }

  return candidates.sort((a, b) => a.daysLeft - b.daysLeft)
}

const kindIcon: Record<ReminderKind, string> = {
  SERVER_PAYMENT: '🖥',
  DOMAIN_RENEWAL: '🌐',
  INVOICE_DUE: '💰',
  PILOT_END: '🧪',
  TASK_DUE: '✅',
}

function when(candidate: ReminderCandidate): string {
  const date = formatDateLong(candidate.dueAt)
  if (candidate.kind === 'PILOT_END') {
    if (candidate.daysLeft < 0) return `закончился ${formatDays(-candidate.daysLeft)} назад (${date}), решение клиента не отмечено`
    if (candidate.daysLeft === 0) return `последний день сегодня — пора принять решение о продолжении`
    return `заканчивается через ${formatDays(candidate.daysLeft)}, ${date} — обсудите с клиентом продолжение`
  }
  if (candidate.kind === 'TASK_DUE') {
    if (candidate.daysLeft < 0) return `просрочена на ${formatDays(-candidate.daysLeft)} (срок ${date})`
    if (candidate.daysLeft === 0) return `срок сегодня`
    return `срок через ${formatDays(candidate.daysLeft)}, ${date}`
  }
  if (candidate.kind === 'INVOICE_DUE') {
    if (candidate.daysLeft < 0) return `оплата просрочена на ${formatDays(-candidate.daysLeft)} (срок ${date})`
    if (candidate.daysLeft === 0) return `клиент должен оплатить сегодня`
    return `ожидается оплата через ${formatDays(candidate.daysLeft)}, до ${date}`
  }
  const verb = candidate.kind === 'DOMAIN_RENEWAL' ? 'продлить' : 'оплатить'
  if (candidate.daysLeft < 0) return `просрочено на ${formatDays(-candidate.daysLeft)} (истекло ${date})`
  if (candidate.daysLeft === 0) return `${verb} сегодня`
  return `${verb} через ${formatDays(candidate.daysLeft)}, до ${date}`
}

export function formatReminders(candidates: ReminderCandidate[], appUrl?: string): string {
  const onlyPilots = candidates.every((candidate) => candidate.kind === 'PILOT_END')
  const lines = [onlyPilots ? '🔔 <b>Напоминание о пилотах</b>' : '🔔 <b>Напоминание о платежах и сроках</b>']
  for (const candidate of candidates) {
    const icon = candidate.daysLeft < 0 ? '⚠️' : kindIcon[candidate.kind]
    const amount = candidate.amount ? ` — ${candidate.amount}` : ''
    lines.push(`${icon} ${escapeHtml(candidate.label)}: ${when(candidate)}${amount}`)
  }
  if (appUrl) lines.push('', appUrl)
  return lines.join('\n')
}

function reminderKey(item: { kind: string; entityId: string; dueAt: string; threshold: number }) {
  return `${item.kind}:${item.entityId}:${item.dueAt}:${item.threshold}`
}

export class RemindersService {
  constructor(
    private readonly db: DbClient,
    private readonly projects: ProjectsService,
    private readonly servers: ServersService,
    private readonly domains: DomainsService,
    private readonly invoices: InvoicesService,
    private readonly tasks: TasksService,
    private readonly notifier: Notifier | null,
    private readonly appUrl?: string,
  ) {}

  /** Sends one Telegram message with every newly crossed threshold, then records them so each fires once. */
  async sendDue(now = new Date()): Promise<{ sent: number }> {
    if (!this.notifier) return { sent: 0 }
    const [projects, servers, domains, invoices, tasks] = await Promise.all([
      this.projects.list(now),
      this.servers.list(now),
      this.domains.list(now),
      this.invoices.list({ status: 'SENT' }, now),
      this.tasks.list({}, now),
    ])
    const candidates = collectReminders({ projects, servers, domains, invoices, tasks, now })
    if (candidates.length === 0) return { sent: 0 }

    const logged = await this.db.reminderLog.findMany({
      where: { entityId: { in: [...new Set(candidates.map((candidate) => candidate.entityId))] } },
      select: { kind: true, entityId: true, dueAt: true, threshold: true },
    })
    const seen = new Set(
      logged.map((row) => reminderKey({ ...row, dueAt: row.dueAt.toISOString().slice(0, 10) })),
    )
    const fresh = candidates.filter((candidate) => !seen.has(reminderKey(candidate)))
    if (fresh.length === 0) return { sent: 0 }

    const delivered = await this.notifier.send(formatReminders(fresh, this.appUrl))
    if (!delivered) return { sent: 0 }

    await this.db.reminderLog.createMany({
      data: fresh.map((candidate) => ({
        kind: candidate.kind,
        entityId: candidate.entityId,
        dueAt: parseDateOnly(candidate.dueAt),
        threshold: candidate.threshold,
      })),
      skipDuplicates: true,
    })
    await this.db.reminderLog.deleteMany({ where: { dueAt: { lt: addDays(todayUtc(now), -120) } } })
    return { sent: fresh.length }
  }
}
