import type { AlertSeverity, DashboardResponse } from '@projects-hq/contracts'

import type { DashboardService } from '../dashboard/service'
import { toDateOnly } from '../lib/dates'
import { formatMoney } from '../lib/text'
import { escapeHtml, type Notifier } from './telegram'

const severityIcon: Record<AlertSeverity, string> = { critical: '🔴', warning: '🟠', info: '🔵' }

/** Builds the daily Telegram summary; returns null when there is nothing worth sending. */
export function formatDigest(dashboard: DashboardResponse, appUrl?: string): string | null {
  const alerts = dashboard.alerts.filter((alert) => alert.kind !== 'PROJECTS_UNMONITORED')
  if (alerts.length === 0) return null

  const lines = [
    '<b>Projects HQ — сводка на сегодня</b>',
    `Проекты: ${dashboard.projects.up} работают, ${dashboard.projects.down} недоступны`,
  ]

  if (dashboard.invoices.outstanding.length > 0) {
    const totals = dashboard.invoices.outstanding.map((entry) => formatMoney(entry.amount, entry.currency))
    lines.push(`К получению: ${totals.join(', ')}`)
  }

  lines.push('')
  for (const alert of alerts) {
    lines.push(`${severityIcon[alert.severity]} ${escapeHtml(alert.title)}`)
  }

  if (appUrl) {
    lines.push('', appUrl)
  }

  return lines.join('\n')
}

export class DailyDigest {
  private lastSentDate: string | null = null

  constructor(
    private readonly hourUtc: number,
    private readonly dashboard: DashboardService,
    private readonly notifier: Notifier | null,
    private readonly appUrl?: string,
  ) {}

  isDue(now: Date): boolean {
    return now.getUTCHours() === this.hourUtc && this.lastSentDate !== toDateOnly(now)
  }

  async runIfDue(now = new Date()): Promise<boolean> {
    if (!this.isDue(now)) return false
    this.lastSentDate = toDateOnly(now)
    return this.send(now)
  }

  async send(now = new Date()): Promise<boolean> {
    if (!this.notifier) return false
    const text = formatDigest(await this.dashboard.build(now), this.appUrl)
    if (!text) return false
    return this.notifier.send(text)
  }
}
