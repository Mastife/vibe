import type { HealthCheckRunDto } from '@projects-hq/contracts'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'

import { EmptyState } from '@/components/empty-state'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Typography } from '@/components/ui/typography'
import { formatDateTime, formatLatency } from '@/lib/format'

const chartConfig = {
  latency: { label: 'Время ответа, мс', color: 'var(--chart-1)' },
  failure: { label: 'Сбой', color: 'var(--status-critical)' },
} satisfies ChartConfig

const timeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

/** Latency line for successful checks plus red markers on the baseline for failed ones; the table twin sits below. */
export function HealthHistoryChart({ runs, withTable = true }: { runs: HealthCheckRunDto[]; withTable?: boolean }) {
  if (runs.length === 0) {
    return <EmptyState title="Проверок ещё не было" description="Нажмите «Проверить сейчас» или дождитесь фоновой проверки." />
  }

  const points = [...runs].reverse().map((run) => ({
    time: run.checkedAt,
    latency: run.ok ? run.latencyMs : null,
    failure: run.ok ? null : 0,
  }))

  return (
    <div className="grid gap-6">
      <ChartContainer config={chartConfig} className="aspect-[3/1] min-h-48 w-full">
        <LineChart data={points} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis
            dataKey="time"
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            tickFormatter={(value: string) => timeFormatter.format(new Date(value))}
          />
          <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(value: number) => `${value}`} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatDateTime(String(value))}
                formatter={(value, name) =>
                  name === 'failure' ? 'Проверка не прошла' : `${Number(value)} мс`
                }
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            type="monotone"
            dataKey="latency"
            stroke="var(--color-latency)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="failure"
            stroke="none"
            dot={{ r: 4, fill: 'var(--color-failure)', stroke: 'var(--background)', strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>

      {withTable && (
        <div className="grid gap-2">
          <Typography variant="bodySmMedium">Последние проверки</Typography>
          <HealthRunsTable runs={runs} />
        </div>
      )}
    </div>
  )
}

/** The raw log of recent checks: the table twin of the chart. */
export function HealthRunsTable({ runs }: { runs: HealthCheckRunDto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Время</TableHead>
          <TableHead>Результат</TableHead>
          <TableHead>HTTP</TableHead>
          <TableHead>Ответ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.slice(0, 12).map((run) => (
          <TableRow key={run.id}>
            <TableCell>{formatDateTime(run.checkedAt)}</TableCell>
            <TableCell>{run.ok ? 'Успешно' : (run.error ?? 'Ошибка')}</TableCell>
            <TableCell>{run.statusCode ?? '—'}</TableCell>
            <TableCell>{formatLatency(run.latencyMs)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
