import { LinkSquare02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ProjectDto } from '@projects-hq/contracts'
import { Link } from '@tanstack/react-router'

import { StatusDot } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { formatDate, formatDays, formatLatency, formatMoney, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

type Tone = 'good' | 'warning' | 'critical' | 'neutral'

const toneStroke: Record<Tone, string> = {
  good: 'stroke-status-good',
  warning: 'stroke-status-warning',
  critical: 'stroke-status-critical',
  neutral: 'stroke-muted-foreground/40',
}

const toneFill: Record<Tone, string> = {
  good: 'bg-status-good',
  warning: 'bg-status-warning',
  critical: 'bg-status-critical',
  neutral: 'bg-muted-foreground/40',
}

function uptimeTone(value: number | null): Tone {
  if (value === null) return 'neutral'
  if (value >= 99.5) return 'good'
  if (value >= 95) return 'warning'
  return 'critical'
}

/** Big verdict band: state in words and colour, one line of evidence, and the way to the live site. */
export function HealthHero({ project }: { project: ProjectDto }) {
  const { health } = project
  const monitored = project.monitorTarget !== null
  const state: Tone = !monitored || health.status === 'UNKNOWN' ? 'neutral' : health.status === 'DOWN' ? 'critical' : 'good'
  const title = !monitored
    ? 'Не мониторится'
    : health.status === 'DOWN'
      ? 'Недоступен'
      : health.status === 'UP'
        ? 'Работает'
        : 'Ещё не проверялся'
  const evidence = !monitored
    ? 'Укажите адрес сайта или контейнер во вкладке «Мониторинг» при изменении проекта.'
    : health.status === 'DOWN'
      ? (health.error ?? 'Проверка не прошла')
      : health.checkedAt
        ? `ответ ${formatLatency(health.latencyMs)} · проверено ${formatRelative(health.checkedAt)}`
        : 'Проверка пройдёт в ближайшие минуты'

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4',
        state === 'good' && 'bg-status-good/15',
        state === 'critical' && 'bg-status-critical text-white',
        state === 'neutral' && 'bg-muted',
      )}
    >
      <div className="grid min-w-0 gap-0.5">
        <div className="flex items-center gap-2.5">
          {state !== 'critical' && <StatusDot tone={state} className="size-3" />}
          <Typography as="span" variant="h4" tone="current">
            {title}
          </Typography>
        </div>
        <Typography as="span" variant="bodySm" tone="current" className="break-words opacity-85">
          {evidence}
        </Typography>
      </div>
      {project.productionUrl && (
        <Button asChild variant={state === 'critical' ? 'secondary' : 'outline'} size="sm">
          <a href={project.productionUrl} target="_blank" rel="noreferrer">
            <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} data-icon="inline-start" />
            <Typography as="span" variant="control" tone="current">
              Открыть сайт
            </Typography>
          </a>
        </Button>
      )}
    </div>
  )
}

/** Uptime as a ring: the arc is the share of successful checks, the number sits in the middle. */
export function UptimeRing({ label, value }: { label: string; value: number | null }) {
  const tone = uptimeTone(value)
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const filled = value === null ? 0 : (Math.max(0, Math.min(100, value)) / 100) * circumference

  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
      <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" role="img" aria-label={`${label}: ${value ?? 'нет данных'}%`}>
        <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className={toneStroke[tone]}
        />
      </svg>
      <div className="grid min-w-0 gap-0.5">
        <Typography as="span" variant="h5" className="tabular-nums">
          {value === null ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`}
        </Typography>
        <Typography as="span" variant="caption" tone="muted">
          {label}
        </Typography>
      </div>
    </div>
  )
}

/** A remaining-time bar: how much of a period is left, coloured as it runs out. */
export function RemainingBar({
  label,
  daysLeft,
  totalDays,
  caption,
  warnBelow,
  criticalBelow,
}: {
  label: string
  daysLeft: number | null
  totalDays: number
  caption: string
  warnBelow: number
  criticalBelow: number
}) {
  const tone: Tone =
    daysLeft === null ? 'neutral' : daysLeft < criticalBelow ? 'critical' : daysLeft < warnBelow ? 'warning' : 'good'
  const share = daysLeft === null ? 0 : Math.max(0, Math.min(1, daysLeft / totalDays))

  return (
    <div className="col-span-2 grid content-center gap-2 rounded-xl bg-muted/40 p-3 lg:col-span-1">
      <div className="flex items-baseline justify-between gap-2">
        <Typography as="span" variant="caption" tone="muted">
          {label}
        </Typography>
        <Typography as="span" variant="bodySmMedium" className="tabular-nums">
          {daysLeft === null ? '—' : daysLeft < 0 ? 'истёк' : formatDays(daysLeft)}
        </Typography>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', toneFill[tone])} style={{ width: `${Math.max(daysLeft === null ? 0 : 3, share * 100)}%` }} />
      </div>
      <Typography as="span" variant="caption" tone="muted">
        {caption}
      </Typography>
    </div>
  )
}

/** The pilot as a timeline from start to end with "today" marked; the decision replaces it once made. */
export function PilotTimeline({ project }: { project: ProjectDto }) {
  const { pilot } = project
  if (!pilot.endsAt) return null
  // Elapsed share from the server's daysLeft, so rendering stays pure (no clock reads here).
  const totalDays = pilot.startsAt
    ? Math.round((Date.parse(`${pilot.endsAt}T00:00:00Z`) - Date.parse(`${pilot.startsAt}T00:00:00Z`)) / 86_400_000)
    : null
  const progress =
    totalDays && totalDays > 0 && pilot.daysLeft !== null
      ? Math.max(0, Math.min(1, (totalDays - pilot.daysLeft) / totalDays))
      : null
  const tone: Tone =
    pilot.state === 'DECIDED'
      ? pilot.outcome === 'CONTINUE'
        ? 'good'
        : 'neutral'
      : pilot.state === 'AWAITING_DECISION'
        ? 'critical'
        : pilot.state === 'ENDING'
          ? 'warning'
          : 'good'
  const headline =
    pilot.state === 'DECIDED'
      ? pilot.outcome === 'CONTINUE'
        ? 'продолжаем'
        : 'отказ'
      : pilot.state === 'AWAITING_DECISION'
        ? 'нужно решение'
        : `осталось ${formatDays(pilot.daysLeft ?? 0)}`

  return (
    <div className="col-span-2 grid content-center gap-2 rounded-xl bg-muted/40 p-3 lg:col-span-1">
      <div className="flex items-baseline justify-between gap-2">
        <Typography as="span" variant="caption" tone="muted">
          Пилот
        </Typography>
        <span className="flex items-center gap-1.5">
          <StatusDot tone={tone} />
          <Typography as="span" variant="bodySmMedium">
            {headline}
          </Typography>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-muted">
        {progress !== null && (
          <div className={cn('h-full rounded-full', toneFill[tone])} style={{ width: `${Math.max(3, progress * 100)}%` }} />
        )}
      </div>
      <Typography as="span" variant="caption" tone="muted">
        {pilot.startsAt ? `${formatDate(pilot.startsAt)} → ${formatDate(pilot.endsAt)}` : `до ${formatDate(pilot.endsAt)}`}
      </Typography>
    </div>
  )
}

function ChipContent({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Typography as="span" variant="caption" tone="muted">
        {label}
      </Typography>
      <Typography as="span" variant="bodySmMedium" className="break-words">
        {value}
      </Typography>
    </>
  )
}

/** Who and what the project involves, as short chips instead of a table of facts. */
export function ProjectChips({ project }: { project: ProjectDto }) {
  const chips = [
    project.client && { key: 'client', label: 'Клиент', value: project.client.name, to: '/clients' as const },
    project.server && {
      key: 'server',
      label: 'Сервер',
      value: project.server.name,
      to: '/servers/$serverId' as const,
      params: { serverId: project.server.id },
    },
    project.monthlyFee !== null && {
      key: 'fee',
      label: 'Абонплата',
      value: `${formatMoney(project.monthlyFee, project.currency)} / мес`,
    },
    project.autoInvoice && {
      key: 'invoice',
      label: 'Автосчёт',
      value: project.pilot.blocksInvoicing ? 'ждёт конца пилота' : `${project.billingDay} числа`,
    },
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; to?: '/clients' | '/servers/$serverId'; params?: { serverId: string } }>

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const className = 'grid min-w-0 gap-0.5 rounded-xl bg-muted/40 px-3 py-2'
        return chip.to ? (
          <Link key={chip.key} to={chip.to} params={chip.params as never} className={cn(className, 'hover:bg-muted')}>
            <ChipContent label={chip.label} value={chip.value} />
          </Link>
        ) : (
          <div key={chip.key} className={className}>
            <ChipContent label={chip.label} value={chip.value} />
          </div>
        )
      })}
    </div>
  )
}
