import type {
  AlertSeverity,
  BillingPeriod,
  InvoiceStatus,
  PaymentState,
  ProjectStatus,
  ServerStatus,
} from '@projects-hq/contracts'

import { formatDate, formatDays } from './format'

export const projectStatusLabels: Record<ProjectStatus, string> = {
  DEVELOPMENT: 'Разработка',
  ACTIVE: 'Активен',
  PAUSED: 'Пауза',
  ARCHIVED: 'Архив',
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
