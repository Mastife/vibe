import type {
  AnalyticsClientDebt,
  AnalyticsForecastMonth,
  AnalyticsMonth,
  AnalyticsServerCost,
  PaymentState,
} from '@projects-hq/contracts'
import { Link } from '@tanstack/react-router'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'

import { formatCompact, formatMonthLong, formatMonthShort, shortName } from '@/components/analytics/format'
import { EmptyState } from '@/components/empty-state'
import { StatusDot } from '@/components/status-badges'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Typography } from '@/components/ui/typography'
import { formatMoney, plural } from '@/lib/format'
import { paymentStateLabel } from '@/lib/labels'
import { cn } from '@/lib/utils'

function MoneyRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex w-full items-center gap-2">
      <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
      <Typography as="span" variant="bodyXs" tone="muted" className="flex-1">
        {label}
      </Typography>
      <Typography as="span" variant="bodyXs" className="tabular-nums">
        {value}
      </Typography>
    </div>
  )
}

const cashflowConfig = {
  income: { label: 'Поступления', color: 'var(--chart-1)' },
  expenses: { label: 'Оплата серверов', color: 'var(--chart-2)' },
} satisfies ChartConfig

/** Paid invoices vs recorded server payments per month, same axis in tenge. */
export function CashflowChart({ months, currency }: { months: AnalyticsMonth[]; currency: string }) {
  if (months.every((month) => month.income === 0 && month.expenses === 0)) {
    return (
      <EmptyState
        title="Движения денег пока нет"
        description="Здесь появятся оплаченные счета и записанные оплаты серверов."
      />
    )
  }

  return (
    <ChartContainer config={cashflowConfig} className="aspect-auto h-64 w-full">
      <BarChart data={months} margin={{ left: 4, right: 4, top: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={formatMonthShort} minTickGap={8} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatCompact} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => formatMonthLong(String(value))}
              formatter={(value, name) => (
                <MoneyRow
                  color={`var(--color-${String(name)})`}
                  label={cashflowConfig[name as keyof typeof cashflowConfig].label}
                  value={formatMoney(Number(value), currency)}
                />
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  )
}

const forecastConfig = {
  serverPayments: { label: 'Продления серверов', color: 'var(--chart-2)' },
} satisfies ChartConfig

/** Upcoming server renewals per month, walked forward from each server's paid-until date. */
export function ForecastChart({ forecast, currency }: { forecast: AnalyticsForecastMonth[]; currency: string }) {
  if (forecast.every((month) => month.serverPayments === 0)) {
    return (
      <EmptyState
        title="Нечего прогнозировать"
        description="Укажите стоимость и дату «оплачен до» у серверов."
      />
    )
  }

  return (
    <ChartContainer config={forecastConfig} className="aspect-auto h-56 w-full">
      <BarChart data={forecast} margin={{ left: 4, right: 4, top: 24, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={formatMonthShort} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatCompact} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(value) => formatMonthLong(String(value))}
              formatter={(value, _name, item) => {
                const renewals = (item.payload as AnalyticsForecastMonth).renewals
                return (
                  <div className="grid w-full gap-0.5">
                    <MoneyRow color="var(--color-serverPayments)" label="К оплате" value={formatMoney(Number(value), currency)} />
                    <Typography as="span" variant="bodyXs" tone="muted">
                      {renewals} {plural(renewals, ['продление', 'продления', 'продлений'])}
                    </Typography>
                  </div>
                )
              }}
            />
          }
        />
        <Bar
          dataKey="serverPayments"
          fill="var(--color-serverPayments)"
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="serverPayments"
            position="top"
            className="fill-foreground"
            formatter={(value) => (Number(value) > 0 ? formatCompact(Number(value)) : '')}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/** Each server's share of the monthly infrastructure bill, largest first. */
export function ServerCostBreakdown({ servers, currency }: { servers: AnalyticsServerCost[]; currency: string }) {
  const total = servers.reduce((sum, server) => sum + server.monthlyCost, 0)
  if (servers.length === 0 || total === 0) {
    return <EmptyState title="Нет платных серверов" description="Укажите стоимость аренды у серверов." />
  }
  const max = Math.max(...servers.map((server) => server.monthlyCost))

  return (
    <div className="grid min-w-0 gap-3">
      {servers.map((server) => (
        <div key={server.id} className="grid min-w-0 gap-1.5">
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <Typography asChild variant="bodySm" truncate className="min-w-0">
              <Link to="/servers/$serverId" params={{ serverId: server.id }} className="hover:underline">
                {server.name}
              </Link>
            </Typography>
            <div className="flex shrink-0 items-baseline gap-2">
              <Typography as="span" variant="bodySmMedium" className="tabular-nums">
                {formatMoney(server.monthlyCost, currency)}
              </Typography>
              <Typography as="span" variant="caption" tone="muted" className="w-10 text-right tabular-nums">
                {Math.round((server.monthlyCost / total) * 100)}%
              </Typography>
            </div>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-2"
              style={{ width: `${Math.max(2, (server.monthlyCost / max) * 100)}%` }}
            />
          </div>
          <Typography variant="caption" tone="muted">
            {server.projectCount} {plural(server.projectCount, ['проект', 'проекта', 'проектов'])}
          </Typography>
        </div>
      ))}
    </div>
  )
}

const runwayTone: Record<PaymentState, 'good' | 'warning' | 'critical' | 'neutral'> = {
  OK: 'good',
  DUE_SOON: 'warning',
  OVERDUE: 'critical',
  UNKNOWN: 'neutral',
}

const runwayBar: Record<PaymentState, string> = {
  OK: 'bg-status-good/85',
  DUE_SOON: 'bg-status-warning',
  OVERDUE: 'bg-status-critical',
  UNKNOWN: 'bg-muted-foreground/40',
}

/** How many days each paid server has left, on a shared two-month scale so runways compare at a glance. */
export function PaymentRunway({ servers }: { servers: AnalyticsServerCost[] }) {
  const rows = servers.filter((server) => server.daysLeft !== null).sort((a, b) => a.daysLeft! - b.daysLeft!)
  if (rows.length === 0) {
    return <EmptyState title="Нет сроков оплаты" description="Укажите «оплачен до» у серверов." />
  }
  const scale = Math.max(62, ...rows.map((server) => server.daysLeft!))

  return (
    <div className="grid min-w-0 gap-3">
      {rows.map((server) => (
        <div key={server.id} className="grid min-w-0 gap-1.5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <Typography as="span" variant="bodySm" truncate className="min-w-0">
              {server.name}
            </Typography>
            <div className="flex shrink-0 items-center gap-2">
              <StatusDot tone={runwayTone[server.paymentState]} />
              <Typography as="span" variant="bodySmMedium">
                {paymentStateLabel(server.paymentState, server.daysLeft, server.paidUntil)}
              </Typography>
            </div>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', runwayBar[server.paymentState])}
              style={{ width: `${Math.min(100, Math.max(2, (Math.max(0, server.daysLeft!) / scale) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

const debtConfig = {
  overdue: { label: 'Просрочено', color: 'var(--chart-2)' },
  current: { label: 'В срок', color: 'var(--chart-1)' },
} satisfies ChartConfig

/** Outstanding invoices per client, overdue part stacked first. */
export function ClientDebtsChart({ debts, currency }: { debts: AnalyticsClientDebt[]; currency: string }) {
  if (debts.length === 0) {
    return <EmptyState title="Долгов нет" description="Все выставленные счета оплачены." />
  }

  return (
    <ChartContainer config={debtConfig} className="aspect-auto w-full" style={{ height: debts.length * 40 + 48 }}>
      <BarChart data={debts} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }} barCategoryGap={10}>
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
            <ChartTooltipContent
              formatter={(value, name) => (
                <MoneyRow
                  color={`var(--color-${String(name)})`}
                  label={debtConfig[name as keyof typeof debtConfig].label}
                  value={formatMoney(Number(value), currency)}
                />
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="overdue" stackId="debt" fill="var(--color-overdue)" maxBarSize={20} isAnimationActive={false} />
        <Bar
          dataKey="current"
          stackId="debt"
          fill="var(--color-current)"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  )
}
