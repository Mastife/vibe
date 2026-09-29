import type { AnalyticsResponse } from '@projects-hq/contracts'

import { StatTile } from '@/components/dashboard/stat-tile'
import {
  CashflowChart,
  ClientDebtsChart,
  ForecastChart,
  PaymentRunway,
  ServerCostBreakdown,
} from '@/components/analytics/finance-charts'
import {
  LatencyBars,
  LifecycleBar,
  SslRunway,
  UptimeHeatmap,
  UptimeTrendChart,
} from '@/components/analytics/health-charts'
import { PageHeader } from '@/components/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatLatency, formatMoney, formatPercent, plural } from '@/lib/format'
import { useAnalytics } from '@/lib/queries'

const skeletonSlots = [0, 1, 2, 3]

export function AnalyticsPage() {
  const analytics = useAnalytics()
  const data = analytics.data

  return (
    <>
      <PageHeader title="Аналитика" description="Здоровье проектов и деньги в графиках: тренды, простои, расходы и прогноз оплат." />

      {analytics.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить аналитику</AlertTitle>
          <AlertDescription>{analytics.error.message}</AlertDescription>
        </Alert>
      )}

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {skeletonSlots.map((slot) => (
            <Skeleton key={slot} className="h-24" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="health" className="gap-6">
          <TabsList>
            <TabsTrigger value="health">Здоровье</TabsTrigger>
            <TabsTrigger value="finance">Финансы</TabsTrigger>
          </TabsList>
          <TabsContent value="health" className="grid gap-6">
            <HealthTab data={data} />
          </TabsContent>
          <TabsContent value="finance" className="grid gap-6">
            <FinanceTab data={data} />
          </TabsContent>
        </Tabs>
      )}
    </>
  )
}

function HealthTab({ data }: { data: AnalyticsResponse }) {
  const { health } = data
  const monitored = health.statusCounts.up + health.statusCounts.down + health.statusCounts.unknown
  const sslSoon = health.projects.filter((project) => project.sslDaysLeft !== null && project.sslDaysLeft < 21).length
  const uptimeTone =
    health.uptime7d === null ? 'default' : health.uptime7d >= 99.5 ? 'good' : health.uptime7d >= 95 ? 'warning' : 'critical'

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Аптайм за 7 дней" value={formatPercent(health.uptime7d)} hint="все проекты под мониторингом" tone={uptimeTone} />
        <StatTile
          label="Работают сейчас"
          value={`${health.statusCounts.up} из ${monitored}`}
          hint={
            health.statusCounts.down > 0
              ? `${health.statusCounts.down} ${plural(health.statusCounts.down, ['недоступен', 'недоступны', 'недоступны'])}`
              : 'все отвечают'
          }
          tone={health.statusCounts.down > 0 ? 'critical' : monitored > 0 ? 'good' : 'default'}
        />
        <StatTile label="Среднее время ответа" value={formatLatency(health.avgLatencyMs)} hint="успешные проверки за 14 дней" />
        <StatTile
          label="SSL скоро истекает"
          value={String(sslSoon)}
          hint="сертификаты, которым осталось меньше 3 недель"
          tone={sslSoon > 0 ? 'warning' : 'default'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Общий аптайм по дням</CardTitle>
          <CardDescription>Доля успешных проверок по всем проектам под мониторингом, последние 14 дней (UTC).</CardDescription>
        </CardHeader>
        <CardContent>
          <UptimeTrendChart daily={health.daily} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Карта доступности</CardTitle>
          <CardDescription>Каждая клетка — день проекта. Наведите, чтобы увидеть точный процент.</CardDescription>
        </CardHeader>
        <CardContent>
          <UptimeHeatmap days={health.days} projects={health.projects} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Время ответа</CardTitle>
            <CardDescription>Среднее по успешным проверкам за 14 дней, самые медленные сверху.</CardDescription>
          </CardHeader>
          <CardContent>
            <LatencyBars projects={health.projects} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>SSL-сертификаты</CardTitle>
            <CardDescription>Сколько дней осталось до истечения, шкала — 90 дней.</CardDescription>
          </CardHeader>
          <CardContent>
            <SslRunway projects={health.projects} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Портфель проектов</CardTitle>
          <CardDescription>Все проекты по стадиям жизненного цикла.</CardDescription>
        </CardHeader>
        <CardContent>
          <LifecycleBar lifecycle={health.lifecycle} />
        </CardContent>
      </Card>
    </>
  )
}

function FinanceTab({ data }: { data: AnalyticsResponse }) {
  const { finance, currency } = data
  const balance = finance.monthlyRevenue - finance.monthlyCost
  const nextMonth = finance.forecast[1]

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Серверы в месяц"
          value={formatMoney(finance.monthlyCost, currency)}
          hint={`${finance.servers.length} ${plural(finance.servers.length, ['платный сервер', 'платных сервера', 'платных серверов'])}`}
        />
        <StatTile
          label="Абонплата проектов"
          value={formatMoney(finance.monthlyRevenue, currency)}
          hint="сумма ежемесячной платы клиентов"
        />
        <StatTile
          label="Баланс в месяц"
          value={formatMoney(balance, currency)}
          hint="абонплата минус серверы"
          tone={balance < 0 ? 'critical' : balance > 0 ? 'good' : 'default'}
        />
        <StatTile
          label="К получению"
          value={formatMoney(finance.outstanding, currency)}
          hint={finance.overdue > 0 ? `просрочено ${formatMoney(finance.overdue, currency)}` : 'просрочек нет'}
          tone={finance.overdue > 0 ? 'warning' : 'default'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Движение денег по месяцам</CardTitle>
          <CardDescription>Оплаченные счета и записанные оплаты серверов за 12 месяцев.</CardDescription>
        </CardHeader>
        <CardContent>
          <CashflowChart months={finance.months} currency={currency} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Из чего складываются расходы</CardTitle>
            <CardDescription>Стоимость серверов в пересчёте на месяц и их доля.</CardDescription>
          </CardHeader>
          <CardContent>
            <ServerCostBreakdown servers={finance.servers} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Запас оплаты серверов</CardTitle>
            <CardDescription>Сколько осталось до конца оплаченного периода.</CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentRunway servers={finance.servers} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Прогноз оплат на полгода</CardTitle>
            <CardDescription>
              {nextMonth && nextMonth.serverPayments > 0
                ? `В следующем месяце — ${formatMoney(nextMonth.serverPayments, currency)} за серверы.`
                : 'Продления серверов по месяцам.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ForecastChart forecast={finance.forecast} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Долги клиентов</CardTitle>
            <CardDescription>Открытые счета по клиентам: просроченные и в срок.</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientDebtsChart debts={finance.clientDebts} currency={currency} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
