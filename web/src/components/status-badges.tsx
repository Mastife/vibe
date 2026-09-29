import type {
  AlertSeverity,
  HealthStatus,
  InvoiceDto,
  PaymentState,
  ProjectStatus,
  ServerStatus,
} from '@projects-hq/contracts'

import { Badge } from '@/components/ui/badge'
import { invoiceStatusLabels, paymentStateLabel, projectStatusLabels, serverStatusLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'

type StatusTone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral'

const dotClass: Record<StatusTone, string> = {
  good: 'bg-status-good',
  warning: 'bg-status-warning',
  serious: 'bg-status-serious',
  critical: 'bg-status-critical',
  neutral: 'bg-muted-foreground/60',
}

/** Colored dot + text label: state is never carried by color alone. */
export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', dotClass[tone], className)} />
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const variant = status === 'ACTIVE' ? 'default' : status === 'ARCHIVED' ? 'ghost' : 'secondary'
  return <Badge variant={variant}>{projectStatusLabels[status]}</Badge>
}

const healthMeta: Record<HealthStatus, { label: string; tone: StatusTone }> = {
  UP: { label: 'Работает', tone: 'good' },
  DOWN: { label: 'Недоступен', tone: 'critical' },
  UNKNOWN: { label: 'Нет данных', tone: 'neutral' },
}

export function HealthBadge({ status }: { status: HealthStatus }) {
  const meta = healthMeta[status]
  return (
    <Badge variant="outline">
      <StatusDot tone={meta.tone} />
      {meta.label}
    </Badge>
  )
}

export function ServerStatusBadge({ status }: { status: ServerStatus }) {
  const variant = status === 'ACTIVE' ? 'default' : status === 'DECOMMISSIONED' ? 'ghost' : 'secondary'
  return <Badge variant={variant}>{serverStatusLabels[status]}</Badge>
}

const paymentTone: Record<PaymentState, StatusTone> = {
  OK: 'good',
  DUE_SOON: 'warning',
  OVERDUE: 'critical',
  UNKNOWN: 'neutral',
}

export function ServerPaymentBadge({
  state,
  daysLeft,
  paidUntil,
}: {
  state: PaymentState
  daysLeft: number | null
  paidUntil: string | null
}) {
  return (
    <Badge variant="outline">
      <StatusDot tone={paymentTone[state]} />
      {paymentStateLabel(state, daysLeft, paidUntil)}
    </Badge>
  )
}

export function InvoiceStatusBadge({ invoice }: { invoice: Pick<InvoiceDto, 'status' | 'isOverdue'> }) {
  if (invoice.isOverdue) {
    return (
      <Badge variant="outline">
        <StatusDot tone="critical" />
        Просрочен
      </Badge>
    )
  }

  const tone: StatusTone =
    invoice.status === 'PAID' ? 'good' : invoice.status === 'SENT' ? 'warning' : 'neutral'
  return (
    <Badge variant="outline">
      <StatusDot tone={tone} />
      {invoiceStatusLabels[invoice.status]}
    </Badge>
  )
}

const severityDot: Record<AlertSeverity, StatusTone> = {
  critical: 'critical',
  warning: 'warning',
  info: 'neutral',
}

export function SeverityDot({ severity, className }: { severity: AlertSeverity; className?: string }) {
  return <StatusDot tone={severityDot[severity]} className={className} />
}
