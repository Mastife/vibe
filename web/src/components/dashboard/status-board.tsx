import { ArrowRight01Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { AlertDto, DashboardResponse, ProjectDto } from '@projects-hq/contracts'
import { Link } from '@tanstack/react-router'

import { SeverityDot, StatusDot } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { formatDays, formatMoneyList, plural } from '@/lib/format'
import { cn } from '@/lib/utils'

type TileState = 'up' | 'degraded' | 'down' | 'unknown'

/**
 * Grafana-style bands: a project that answers now but lost more than 1% of today's checks is flagged
 * as degraded; a stray failed check (99.x%) is not worth a colour.
 */
function tileState(project: ProjectDto): TileState {
  if (project.health.status === 'DOWN') return 'down'
  if (project.health.status === 'UNKNOWN') return 'unknown'
  if (project.health.uptime24h !== null && project.health.uptime24h < 99) return 'degraded'
  return 'up'
}

const tileClass: Record<TileState, string> = {
  up: 'bg-status-good/12 ring-status-good/35',
  degraded: 'bg-status-warning/18 ring-status-warning/50',
  down: 'bg-status-critical text-white ring-status-critical',
  unknown: 'bg-muted ring-border',
}

const tileTone: Record<TileState, 'good' | 'warning' | 'critical' | 'neutral'> = {
  up: 'good',
  degraded: 'warning',
  down: 'critical',
  unknown: 'neutral',
}

const tileLabel: Record<TileState, string> = {
  up: 'работает',
  degraded: 'были сбои',
  down: 'недоступен',
  unknown: 'нет данных',
}

function alertTarget(alert: AlertDto) {
  if (alert.entityType === 'project' && alert.entityId) {
    return { to: '/projects/$projectId' as const, params: { projectId: alert.entityId } }
  }
  if (alert.entityType === 'server' && alert.entityId) {
    return { to: '/servers/$serverId' as const, params: { serverId: alert.entityId } }
  }
  if (alert.entityType === 'invoice') return { to: '/invoices' as const }
  if (alert.entityType === 'domain') return { to: '/domains' as const }
  return { to: '/projects' as const }
}

type StatusBoardProps = {
  data: DashboardResponse
  onRunChecks: () => void
  checking: boolean
}

/**
 * One-screen overview for phones: overall verdict, a status tile per monitored project, four key
 * numbers, and the top of the attention list. Details stay in the sections below.
 */
export function StatusBoard({ data, onRunChecks, checking }: StatusBoardProps) {
  const projects = data.monitoredProjects
  const down = projects.filter((project) => project.health.status === 'DOWN')
  const degraded = projects.filter((project) => tileState(project) === 'degraded')
  const problems = data.alerts.filter((alert) => alert.severity !== 'info')
  const critical = data.alerts.filter((alert) => alert.severity === 'critical')
  const nextServer = data.upcomingServerPayments[0]
  const verdict: 'good' | 'warning' | 'critical' = critical.length > 0 || down.length > 0 ? 'critical' : problems.length > 0 ? 'warning' : 'good'

  const headline =
    verdict === 'good'
      ? `Все ${projects.length} ${plural(projects.length, ['проект работает', 'проекта работают', 'проектов работают'])}`
      : down.length > 0
        ? `${down.length} ${plural(down.length, ['проект недоступен', 'проекта недоступны', 'проектов недоступны'])}`
        : `${problems.length} ${plural(problems.length, ['вопрос требует', 'вопроса требуют', 'вопросов требуют'])} внимания`
  const subline =
    verdict === 'good'
      ? degraded.length > 0
        ? `За сутки были сбои: ${degraded.map((project) => project.name).join(', ')}`
        : 'Сбоев за сутки нет, срочных оплат нет'
      : down.length > 0
        ? down.map((project) => `${project.name}: ${project.health.error ?? 'не отвечает'}`).join('; ')
        : (problems[0]?.title ?? '')

  const kpis = [
    {
      label: 'Ближайшая оплата',
      value: nextServer?.payment.daysLeft !== null && nextServer
        ? nextServer.payment.daysLeft < 0
          ? `просрочено ${formatDays(-nextServer.payment.daysLeft)}`
          : nextServer.payment.daysLeft === 0
            ? 'сегодня'
            : `через ${formatDays(nextServer.payment.daysLeft)}`
        : '—',
      hint: nextServer?.name ?? 'серверов с оплатой нет',
      tone: data.servers.overdue > 0 ? 'critical' : data.servers.dueSoon > 0 ? 'warning' : 'default',
    },
    {
      label: 'К получению',
      value: formatMoneyList(data.invoices.outstanding, '0 ₸'),
      hint: data.invoices.overdueCount > 0 ? `просрочено счетов: ${data.invoices.overdueCount}` : 'просрочек нет',
      tone: data.invoices.overdueCount > 0 ? 'warning' : 'default',
    },
    {
      label: 'Серверы в месяц',
      value: formatMoneyList(data.servers.monthlyCost, '0 ₸'),
      hint: `${data.servers.active} ${plural(data.servers.active, ['сервер', 'сервера', 'серверов'])}`,
      tone: 'default',
    },
    {
      label: 'Предупреждения',
      value: String(problems.length),
      hint: critical.length > 0 ? `критичных: ${critical.length}` : 'критичных нет',
      tone: critical.length > 0 ? 'critical' : problems.length > 0 ? 'warning' : 'default',
    },
  ] as const

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <Typography variant="h4">Обзор</Typography>
        <Button type="button" variant="outline" size="sm" onClick={onRunChecks} disabled={checking}>
          <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} data-icon="inline-start" />
          {checking ? 'Проверяем...' : 'Проверить'}
        </Button>
      </div>

      <div
        role="status"
        className={cn(
          'grid gap-0.5 rounded-xl px-4 py-3',
          verdict === 'good' && 'bg-status-good/15',
          verdict === 'warning' && 'bg-status-warning/20',
          verdict === 'critical' && 'bg-status-critical text-white',
        )}
      >
        <div className="flex items-center gap-2">
          {verdict !== 'critical' && <StatusDot tone={verdict} />}
          <Typography as="span" variant="h6" tone="current">
            {headline}
          </Typography>
        </div>
        {subline && (
          <Typography as="span" variant="caption" tone="current" className="opacity-85">
            {subline}
          </Typography>
        )}
      </div>

      {projects.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {projects.map((project) => {
            const state = tileState(project)
            return (
              <Link
                key={project.id}
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                aria-label={`${project.name}: ${tileLabel[state]}`}
                className={cn('grid min-w-0 gap-0.5 rounded-lg px-2 py-1.5 ring-1 ring-inset', tileClass[state])}
              >
                <span className="flex min-w-0 items-start gap-1.5">
                  {state !== 'down' && <StatusDot tone={tileTone[state]} className="mt-1.5 size-1.5" />}
                  <Typography as="span" variant="caption" tone="current" className="min-w-0 break-words">
                    <Typography as="span" variant="emphasis">
                      {project.name}
                    </Typography>
                  </Typography>
                </span>
                <Typography as="span" variant="caption" tone="current" className="tabular-nums opacity-80">
                  {state === 'down'
                    ? 'недоступен'
                    : project.health.uptime24h === null
                      ? tileLabel[state]
                      : `${project.health.uptime24h.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% · 24 ч`}
                </Typography>
              </Link>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="grid min-w-0 gap-0.5 rounded-lg bg-muted/50 px-3 py-2">
            <Typography as="span" variant="caption" tone="muted">
              {kpi.label}
            </Typography>
            <span className="flex min-w-0 items-center gap-1.5">
              {kpi.tone !== 'default' && <StatusDot tone={kpi.tone} className="size-1.5" />}
              <Typography as="span" variant="bodySmMedium" className="min-w-0 break-words tabular-nums">
                {kpi.value}
              </Typography>
            </span>
            <Typography as="span" variant="caption" tone="muted" className="break-words">
              {kpi.hint}
            </Typography>
          </div>
        ))}
      </div>

      {/* The banner already names the first problem, so the list continues from the second. */}
      {problems.length > 1 && (
        <div className="grid gap-1">
          {problems.slice(1, 4).map((alert) => (
            <Link
              key={alert.id}
              {...alertTarget(alert)}
              className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60"
            >
              <SeverityDot severity={alert.severity} className="size-2 shrink-0" />
              <Typography as="span" variant="bodySm" className="min-w-0 flex-1 break-words">
                {alert.title}
              </Typography>
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
          {problems.length > 4 && (
            <Typography as="span" variant="caption" tone="muted" className="px-2">
              {`и ещё ${problems.length - 4} — список ниже`}
            </Typography>
          )}
        </div>
      )}
    </div>
  )
}
