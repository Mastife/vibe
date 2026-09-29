import type { AnalyticsDay, AnalyticsProjectHealth, AnalyticsResponse } from '@projects-hq/contracts'
import { Link } from '@tanstack/react-router'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'

import { formatDayShort, shortName } from '@/components/analytics/format'
import { EmptyState } from '@/components/empty-state'
import { StatusDot } from '@/components/status-badges'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Typography } from '@/components/ui/typography'
import { formatDays, formatLatency, formatPercent } from '@/lib/format'
import { projectStatusLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'

type Tone = 'good' | 'warning' | 'critical' | 'neutral'

/** Uptime bands shared by the heatmap cells and their legend. */
function uptimeTone(uptime: number | null): Tone {
  if (uptime === null) return 'neutral'
  if (uptime >= 99.5) return 'good'
  if (uptime >= 95) return 'warning'
  return 'critical'
}

const toneLabel: Record<Tone, string> = {
  good: '≥ 99,5% — стабильно',
  warning: '95–99,5% — были сбои',
  critical: '< 95% — серьёзный простой',
  neutral: 'нет проверок',
}

const cellClass: Record<Tone, string> = {
  good: 'bg-status-good/85',
  warning: 'bg-status-warning',
  critical: 'bg-status-critical',
  neutral: 'bg-muted',
}

const trendConfig = {
  uptime: { label: 'Аптайм', color: 'var(--chart-1)' },
} satisfies ChartConfig

/** Single-series uptime trend across all monitored projects; failures ride along in the tooltip. */
export function UptimeTrendChart({ daily }: { daily: AnalyticsDay[] }) {
  if (daily.every((day) => day.uptime === null)) {
    return <EmptyState title="Проверок пока нет" description="График появится после первых фоновых проверок." />
  }
  const lowest = Math.min(...daily.flatMap((day) => (day.uptime === null ? [] : [day.uptime])))
  const floor = Math.max(0, Math.floor(Math.min(lowest, 98) / 2) * 2)

  return (
    <ChartContainer config={trendConfig} className="aspect-auto h-56 w-full">
      <AreaChart data={daily} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="uptime-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-uptime)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-uptime)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={40}
          tickFormatter={formatDayShort}
        />
        <YAxis
          domain={[floor, 100]}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(value: number) => `${value}%`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => formatDayShort(String(value))}
              formatter={(_value, _name, item) => {
                const day = item.payload as AnalyticsDay
                return (
                  <div className="grid gap-0.5">
                    <Typography as="span" variant="bodyXs">
                      Аптайм: {formatPercent(day.uptime)}
                    </Typography>
                    <Typography as="span" variant="bodyXs" tone="muted">
                      {day.checks} проверок, сбоев: {day.failures}
                    </Typography>
                  </div>
                )
              }}
            />
          }
        />
        <Area
          dataKey="uptime"
          type="monotone"
          stroke="var(--color-uptime)"
          strokeWidth={2}
          fill="url(#uptime-fill)"
          connectNulls={false}
          dot={false}
          activeDot={{ r: 4, stroke: 'var(--background)', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}

/** Project x day grid: each cell is one day's uptime band; hover names the exact figure. */
export function UptimeHeatmap({ days, projects }: { days: string[]; projects: AnalyticsProjectHealth[] }) {
  if (projects.length === 0) {
    return <EmptyState title="Нет проектов под мониторингом" description="Укажите адрес продакшена или health-check у проекта." />
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="grid gap-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-xl table-fixed border-separate border-spacing-0.5">
            <thead>
              <tr>
                <th className="w-44" />
                {days.map((date, index) => (
                  <th key={date} scope="col" className="overflow-visible px-0 text-left">
                    {(index % 3 === 0 || index === days.length - 1) && (
                      <Typography as="span" variant="caption" tone="muted" className="whitespace-nowrap">
                        {formatDayShort(date)}
                      </Typography>
                    )}
                  </th>
                ))}
                <th scope="col" className="w-16 pl-3 text-right">
                  <Typography as="span" variant="caption" tone="muted">
                    7 дней
                  </Typography>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <th scope="row" className="pr-2 text-left">
                    <Typography asChild variant="bodySm" truncate className="min-w-0">
                      <Link to="/projects/$projectId" params={{ projectId: project.id }} className="block hover:underline">
                        {project.name}
                      </Link>
                    </Typography>
                  </th>
                  {project.daily.map((uptime, index) => {
                    const tone = uptimeTone(uptime)
                    return (
                      <td key={days[index]} className="p-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              role="img"
                              aria-label={`${project.name}, ${formatDayShort(days[index]!)}: ${uptime === null ? 'нет проверок' : formatPercent(uptime)}`}
                              className={cn('h-6 rounded-sm', cellClass[tone])}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {project.name} · {formatDayShort(days[index]!)} ·{' '}
                            {uptime === null ? 'нет проверок' : `аптайм ${formatPercent(uptime)}`}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    )
                  })}
                  <td className="pl-3 text-right">
                    <Typography as="span" variant="bodySmMedium" className="tabular-nums">
                      {formatPercent(project.uptime7d)}
                    </Typography>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {(['good', 'warning', 'critical', 'neutral'] as const).map((tone) => (
            <div key={tone} className="flex items-center gap-2">
              <span aria-hidden className={cn('size-3 rounded-sm', cellClass[tone])} />
              <Typography as="span" variant="caption" tone="muted">
                {toneLabel[tone]}
              </Typography>
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  )
}

const latencyConfig = {
  avgLatencyMs: { label: 'Среднее время ответа', color: 'var(--chart-1)' },
} satisfies ChartConfig

/** Average response time per project over the window, slowest on top. */
export function LatencyBars({ projects }: { projects: AnalyticsProjectHealth[] }) {
  const rows = projects
    .filter((project) => project.avgLatencyMs !== null)
    .sort((a, b) => b.avgLatencyMs! - a.avgLatencyMs!)
  if (rows.length === 0) {
    return <EmptyState title="Нет успешных проверок" description="Время ответа считается только по успешным проверкам." />
  }

  return (
    <ChartContainer config={latencyConfig} className="aspect-auto w-full" style={{ height: rows.length * 36 + 16 }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 56, top: 0, bottom: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          width={150}
          tickFormatter={shortName}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent hideIndicator formatter={(value) => formatLatency(Number(value))} />
          }
        />
        <Bar dataKey="avgLatencyMs" fill="var(--color-avgLatencyMs)" radius={4} maxBarSize={20} isAnimationActive={false}>
          <LabelList
            dataKey="avgLatencyMs"
            position="right"
            className="fill-foreground"
            formatter={(value) => formatLatency(Number(value))}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

function sslTone(daysLeft: number): Tone {
  if (daysLeft < 7) return 'critical'
  if (daysLeft < 21) return 'warning'
  return 'good'
}

/** Days until each certificate expires on a 90-day scale; HTTP-only projects are listed separately. */
export function SslRunway({ projects }: { projects: AnalyticsProjectHealth[] }) {
  const withSsl = projects.filter((project) => project.sslDaysLeft !== null).sort((a, b) => a.sslDaysLeft! - b.sslDaysLeft!)
  const withoutSsl = projects.filter((project) => project.sslDaysLeft === null)
  if (withSsl.length === 0) {
    return <EmptyState title="Нет данных о сертификатах" description="Срок SSL читается при проверке HTTPS-адресов." />
  }

  return (
    <div className="grid min-w-0 gap-3">
      {withSsl.map((project) => {
        const days = project.sslDaysLeft!
        const tone = sslTone(days)
        return (
          <div key={project.id} className="grid min-w-0 gap-1.5">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <Typography as="span" variant="bodySm" truncate className="min-w-0">
                {project.name}
              </Typography>
              <div className="flex shrink-0 items-center gap-2">
                <StatusDot tone={tone} />
                <Typography as="span" variant="bodySmMedium" className="tabular-nums">
                  {days < 0 ? 'истёк' : formatDays(days)}
                </Typography>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', cellClass[tone])}
                style={{ width: `${Math.min(100, Math.max(2, (days / 90) * 100))}%` }}
              />
            </div>
          </div>
        )
      })}
      {withoutSsl.length > 0 && (
        <Typography variant="caption" tone="muted">
          Без HTTPS-данных: {withoutSsl.map((project) => project.name).join(', ')}
        </Typography>
      )}
    </div>
  )
}

const lifecycleColor: Record<AnalyticsResponse['health']['lifecycle'][number]['status'], string> = {
  ACTIVE: 'var(--chart-1)',
  DEVELOPMENT: 'var(--chart-2)',
  PAUSED: 'var(--chart-3)',
  ARCHIVED: 'var(--chart-4)',
}

/** Part-to-whole bar of the portfolio by lifecycle status, with a labelled legend. */
export function LifecycleBar({ lifecycle }: { lifecycle: AnalyticsResponse['health']['lifecycle'] }) {
  const total = lifecycle.reduce((sum, entry) => sum + entry.count, 0)
  if (total === 0) return <EmptyState title="Проектов пока нет" />
  const parts = lifecycle.filter((entry) => entry.count > 0)

  return (
    <div className="grid gap-4">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {parts.map((entry) => (
          <div
            key={entry.status}
            role="img"
            aria-label={`${projectStatusLabels[entry.status]}: ${entry.count}`}
            style={{ flexGrow: entry.count, background: lifecycleColor[entry.status] }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {lifecycle.map((entry) => (
          <div key={entry.status} className="grid gap-0.5">
            <div className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: lifecycleColor[entry.status] }} />
              <Typography as="span" variant="caption" tone="muted">
                {projectStatusLabels[entry.status]}
              </Typography>
            </div>
            <Typography as="span" variant="h5" className="tabular-nums">
              {entry.count}
            </Typography>
          </div>
        ))}
      </div>
    </div>
  )
}
