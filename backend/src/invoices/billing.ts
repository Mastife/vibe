import type { DbClient } from '../db'
import type { AppEnv } from '../env'
import { addDays, toDateOnly, todayUtc } from '../lib/dates'
import { decimalToNumber } from '../lib/money'
import { formatDateLong, formatMoney, formatMonth } from '../lib/text'
import { escapeHtml, type Notifier } from '../notifications/telegram'
import { pilotBlocksInvoicing } from '../projects/pilot'

/** Days after the billing day during which a missed run (worker offline) still issues that month's invoice. */
export const billingGraceDays = 7

/**
 * The `YYYY-MM` period to bill today, or null outside the billing window. The window is
 * [billingDay, billingDay + grace], so turning auto-invoicing on after the billing day
 * starts with next month instead of back-billing the current one.
 */
export function dueBillingPeriod(billingDay: number, today: Date): string | null {
  const day = today.getUTCDate()
  if (day < billingDay || day > billingDay + billingGraceDays) return null
  return toDateOnly(today).slice(0, 7)
}

export type IssuedInvoice = {
  clientName: string
  title: string
  amount: number
  currency: string
  dueAt: string
}

export function formatIssuedInvoices(invoices: IssuedInvoice[]): string {
  const lines = ['🧾 <b>Выставлены счета по абонплате</b>']
  for (const invoice of invoices) {
    lines.push(
      `• ${escapeHtml(invoice.clientName)} — ${escapeHtml(invoice.title)}: ${formatMoney(invoice.amount, invoice.currency)}, оплатить до ${formatDateLong(invoice.dueAt)}`,
    )
  }
  return lines.join('\n')
}

export class BillingService {
  constructor(
    private readonly db: DbClient,
    private readonly env: Pick<AppEnv, 'INVOICE_DUE_DAYS'>,
    private readonly notifier: Notifier | null,
  ) {}

  /** Issues this month's subscription invoice for every opted-in project; safe to run any number of times. */
  async issueDue(now = new Date()): Promise<{ issued: number }> {
    const today = todayUtc(now)
    const projects = await this.db.project.findMany({
      where: { autoInvoice: true, status: 'ACTIVE', clientId: { not: null }, monthlyFee: { gt: 0 } },
      select: {
        id: true,
        name: true,
        clientId: true,
        monthlyFee: true,
        currency: true,
        billingDay: true,
        pilotEndsAt: true,
        pilotOutcome: true,
        client: { select: { name: true } },
      },
    })

    const issued: IssuedInvoice[] = []
    for (const project of projects) {
      const period = dueBillingPeriod(project.billingDay, today)
      if (!period || !project.clientId) continue
      if (pilotBlocksInvoicing(project.pilotEndsAt, project.pilotOutcome, now)) continue

      const title = `Абонплата «${project.name}» за ${formatMonth(period)}`
      const amount = decimalToNumber(project.monthlyFee)
      const dueAt = addDays(today, this.env.INVOICE_DUE_DAYS)
      // The (projectId, autoPeriod) unique index makes a concurrent or repeated run a no-op.
      const created = await this.db.invoice.createMany({
        data: [
          {
            clientId: project.clientId,
            projectId: project.id,
            title,
            amount,
            currency: project.currency,
            status: 'SENT',
            issuedAt: today,
            dueAt,
            autoPeriod: period,
            note: 'Выставлен автоматически',
          },
        ],
        skipDuplicates: true,
      })
      if (created.count === 0) continue

      issued.push({
        clientName: project.client?.name ?? '',
        title,
        amount,
        currency: project.currency,
        dueAt: toDateOnly(dueAt),
      })
    }

    if (issued.length > 0 && this.notifier) {
      await this.notifier.send(formatIssuedInvoices(issued))
    }
    return { issued: issued.length }
  }
}
