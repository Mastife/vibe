import type {
  AlertSeverity,
  BillingPeriod,
  InvoiceStatus,
  PaymentState,
  PilotOutcome,
  ProjectPilot,
  ProjectStatus,
  ServerStatus,
  TaskDto,
  TaskStatus,
} from '@projects-hq/contracts'

import { formatDate, formatDays } from './format'

export const projectStatusLabels: Record<ProjectStatus, string> = {
  DEVELOPMENT: 'Разработка',
  ACTIVE: 'Активен',
  PAUSED: 'Пауза',
  ARCHIVED: 'Архив',
}

export const taskStatusLabels: Record<TaskStatus, string> = {
  TODO: 'К выполнению',
  IN_PROGRESS: 'В работе',
  DONE: 'Готово',
}

/** Deadline in plain words: "сегодня", "завтра", "через 5 дней", "просрочено на 2 дня". Null without a deadline. */
export function taskDueLabel(task: Pick<TaskDto, 'dueAt' | 'daysLeft' | 'status'>): string | null {
  if (!task.dueAt) return null
  if (task.status === 'DONE' || task.daysLeft === null) return `срок ${formatDate(task.dueAt)}`
  if (task.daysLeft < 0) return `просрочено на ${formatDays(-task.daysLeft)}`
  if (task.daysLeft === 0) return 'сегодня'
  if (task.daysLeft === 1) return 'завтра'
  return `через ${formatDays(task.daysLeft)}`
}

export const serverStatusLabels: Record<ServerStatus, string> = {
  ACTIVE: 'Активен',
  SUSPENDED: 'Приостановлен',
  DECOMMISSIONED: 'Выведен',
}

export const billingPeriodLabels: Record<BillingPeriod, string> = {
  MONTHLY: 'Ежемесячно',
  QUARTERLY: 'Раз в квартал',
  YEARLY: 'Раз в год',
}

export const billingPeriodShortLabels: Record<BillingPeriod, string> = {
  MONTHLY: 'мес',
  QUARTERLY: 'квартал',
  YEARLY: 'год',
}

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  DRAFT: 'Черновик',
  SENT: 'Выставлен',
  PAID: 'Оплачен',
  CANCELLED: 'Отменён',
}

export const severityLabels: Record<AlertSeverity, string> = {
  critical: 'Критично',
  warning: 'Внимание',
  info: 'Инфо',
}

export function paymentStateLabel(state: PaymentState, daysLeft: number | null, paidUntil: string | null): string {
  switch (state) {
    case 'OVERDUE':
      return `Просрочен на ${formatDays(Math.abs(daysLeft ?? 0))}`
    case 'DUE_SOON':
      return daysLeft === 0 ? 'Оплатить сегодня' : `Оплатить через ${formatDays(daysLeft ?? 0)}`
    case 'OK':
      return `Оплачен до ${formatDate(paidUntil)}`
    default:
      return 'Срок оплаты не задан'
  }
}

export const pilotOutcomeLabels: Record<PilotOutcome, string> = {
  CONTINUE: 'Продолжаем работу',
  DECLINE: 'Клиент отказался',
}

/** One-line pilot status for badges; null when the project has no pilot. */
export function pilotLabel(pilot: ProjectPilot): string | null {
  switch (pilot.state) {
    case 'ACTIVE':
      return `Пилот до ${formatDate(pilot.endsAt)}`
    case 'ENDING':
      return pilot.daysLeft === 0 ? 'Пилот: последний день' : `Пилот: осталось ${formatDays(pilot.daysLeft ?? 0)}`
    case 'AWAITING_DECISION':
      return 'Пилот окончен — нужно решение'
    case 'DECIDED':
      return pilot.outcome === 'CONTINUE' ? 'Пилот: продолжаем' : 'Пилот: отказ'
    default:
      return null
  }
}
