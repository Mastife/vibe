import { Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'

import { AlertsList } from '@/components/dashboard/alerts-list'
import { MonitoredProjectsTable } from '@/components/dashboard/monitored-projects-table'
import { StatTile } from '@/components/dashboard/stat-tile'
import { StatusBoard } from '@/components/dashboard/status-board'
import { useIsMobile } from '@/hooks/use-mobile'
import { OpenInvoicesList, UpcomingServerPayments } from '@/components/dashboard/upcoming-payments'
import { PageHeader } from '@/components/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMoneyList, plural } from '@/lib/format'
import { useDashboard, useRunHealthChecks } from '@/lib/queries'

const skeletonSlots = [0, 1, 2, 3, 4, 5]

export function DashboardPage() {
  const dashboard = useDashboard()
  const runChecks = useRunHealthChecks()
  // Rendered, not CSS-hidden, so the page never carries both layouts at once.
  const isMobile = useIsMobile() === true

  function handleRunChecks() {
    runChecks.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(`Проверено ${result.checked}: ${result.up} работают, ${result.down} недоступны`)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  const data = dashboard.data

  return (
    <>
      {!isMobile && (
        <PageHeader title="Обзор" description="Здоровье проектов, оплата серверов и счета клиентов в одном месте.">
          <Button type="button" variant="outline" onClick={handleRunChecks} disabled={runChecks.isPending}>
            <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} data-icon="inline-start" />
            {runChecks.isPending ? 'Проверяем...' : 'Проверить все проекты'}
          </Button>
        </PageHeader>
      )}

      {dashboard.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить обзор</AlertTitle>
          <AlertDescription>{dashboard.error.message}</AlertDescription>
        </Alert>
      )}

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {skeletonSlots.map((slot) => (
            <Skeleton key={slot} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          {/* Phones get a one-screen status board; wider screens keep the full tile row. */}
          {isMobile ? (
            <StatusBoard data={data} onRunChecks={handleRunChecks} checking={runChecks.isPending} />
          ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <StatTile
              label="Проекты работают"
              value={`${data.projects.up} из ${data.projects.up + data.projects.down + data.projects.unknown}`}
              hint={`${data.projects.unknown} без данных`}
              tone={data.projects.up > 0 && data.projects.down === 0 ? 'good' : 'default'}
            />
            <StatTile
              label="Недоступны"
              value={String(data.projects.down)}
              hint={data.projects.down > 0 ? 'нужно вмешаться' : 'всё отвечает'}
              tone={data.projects.down > 0 ? 'critical' : 'default'}
            />
            <StatTile
              label="Серверы к оплате"
              value={String(data.servers.dueSoon + data.servers.overdue)}
              hint={`просрочено ${data.servers.overdue}, всего серверов ${data.servers.active}`}
              tone={data.servers.overdue > 0 ? 'critical' : data.servers.dueSoon > 0 ? 'warning' : 'default'}
            />
            <StatTile
              label="Инфраструктура в месяц"
              value={formatMoneyList(data.servers.monthlyCost, '0')}
              hint="активные серверы, в пересчёте на месяц"
            />
            <StatTile
              label="К получению"
              value={formatMoneyList(data.invoices.outstanding, '0')}
              hint={
                data.invoices.overdueCount > 0
                  ? `${data.invoices.overdueCount} ${plural(data.invoices.overdueCount, ['счёт просрочен', 'счёта просрочены', 'счетов просрочено'])}`
                  : 'просроченных счетов нет'
              }
              tone={data.invoices.overdueCount > 0 ? 'warning' : 'default'}
            />
            <StatTile
              label="Получено за 30 дней"
              value={formatMoneyList(data.invoices.paidLast30Days, '0')}
              hint="оплаченные счета"
            />
          </div>
          )}

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Требует внимания</CardTitle>
                <CardDescription>Недоступные проекты, сроки оплаты серверов и счета.</CardDescription>
              </CardHeader>
              <CardContent>
                <AlertsList alerts={data.alerts} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Ближайшие оплаты серверов</CardTitle>
                <CardDescription>
                  <Link to="/servers" className="underline underline-offset-4">
                    Все серверы
                  </Link>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UpcomingServerPayments servers={data.upcomingServerPayments} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Доступность проектов</CardTitle>
              <CardDescription>Последняя проверка каждого проекта с адресом продакшена или health-check.</CardDescription>
            </CardHeader>
            <CardContent>
              <MonitoredProjectsTable projects={data.monitoredProjects} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Открытые счета</CardTitle>
              <CardDescription>
                <Link to="/invoices" className="underline underline-offset-4">
                  Все счета
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OpenInvoicesList invoices={data.openInvoices} />
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
