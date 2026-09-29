import { CreditCardIcon, Delete02Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ServerDto } from '@projects-hq/contracts'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { PageHeader } from '@/components/page-header'
import { ServerFormDialog } from '@/components/servers/server-form-dialog'
import { billingPeriodLabels } from '@/lib/labels'
import { ServerPaymentDialog } from '@/components/servers/server-payment-dialog'
import { ServerPaymentBadge, ServerStatusBadge } from '@/components/status-badges'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Typography } from '@/components/ui/typography'
import { formatDate, formatMoney } from '@/lib/format'
import { useDeleteServer, useDeleteServerPayment, useServer } from '@/lib/queries'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <Typography variant="caption" tone="muted">
        {label}
      </Typography>
      <Typography as="div" variant="bodySm">
        {children}
      </Typography>
    </div>
  )
}

export function ServerDetailPage() {
  const { serverId } = useParams({ from: '/servers/$serverId' })
  const navigate = useNavigate()
  const detail = useServer(serverId)
  const deleteServer = useDeleteServer()
  const deletePayment = useDeleteServerPayment()
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState<ServerDto | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)

  if (detail.isPending) {
    return <Skeleton className="h-96" />
  }

  if (detail.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Не удалось загрузить сервер</AlertTitle>
        <AlertDescription>{detail.error.message}</AlertDescription>
      </Alert>
    )
  }

  const { server, payments } = detail.data

  function handleDelete() {
    deleteServer.mutate(server.id, {
      onSuccess: () => {
        toast.success('Сервер удалён')
        void navigate({ to: '/servers' })
      },
      onError: (error) => toast.error(error.message),
    })
  }

  function handleDeletePayment() {
    if (!deletingPaymentId) return
    deletePayment.mutate(
      { id: server.id, paymentId: deletingPaymentId },
      {
        onSuccess: (result) => {
          toast.success(
            result.server.paidUntil
              ? `Платёж удалён: сервер оплачен до ${formatDate(result.server.paidUntil)}`
              : 'Платёж удалён: срок оплаты сброшен',
          )
          setDeletingPaymentId(null)
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <>
      <PageHeader
        title={server.name}
        description={[server.provider, server.host, server.location].filter(Boolean).join(' · ') || undefined}
      >
        <Button type="button" onClick={() => setPaying(server)}>
          <HugeiconsIcon icon={CreditCardIcon} strokeWidth={2} data-icon="inline-start" />
          Записать оплату
        </Button>
        <Button type="button" variant="outline" onClick={() => setEditing(true)}>
          <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} data-icon="inline-start" />
          Изменить
        </Button>
        <Button type="button" variant="destructive" onClick={() => setDeleting(true)}>
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
          Удалить
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <ServerStatusBadge status={server.status} />
        <ServerPaymentBadge state={server.payment.state} daysLeft={server.payment.daysLeft} paidUntil={server.paidUntil} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Оплата</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Fact label="Стоимость">{`${formatMoney(server.monthlyCost, server.currency)} · ${billingPeriodLabels[server.billingPeriod].toLowerCase()}`}</Fact>
            <Fact label="Оплачен до">{formatDate(server.paidUntil)}</Fact>
            <Fact label="Конфигурация">{server.specs ?? '—'}</Fact>
            <Fact label="Панель провайдера">
              {server.panelUrl ? (
                <Typography asChild variant="bodySm">
                  <a href={server.panelUrl} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">
                    {server.panelUrl}
                  </a>
                </Typography>
              ) : (
                '—'
              )}
            </Fact>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Проекты на сервере</CardTitle>
            <CardDescription>Привязка настраивается в карточке проекта.</CardDescription>
          </CardHeader>
          <CardContent>
            {server.projects.length === 0 ? (
              <Typography variant="bodySm" tone="muted">
                Пока ни один проект не привязан к этому серверу.
              </Typography>
            ) : (
              <div className="flex flex-wrap gap-2">
                {server.projects.map((project) => (
                  <Button key={project.id} asChild variant="outline" size="sm">
                    <Link to="/projects/$projectId" params={{ projectId: project.id }}>
                      {project.name}
                    </Link>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>История оплат</CardTitle>
          <CardDescription>Каждая запись продлевает срок «оплачен до» на выбранное число периодов.</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <Typography variant="bodySm" tone="muted">
              Оплат ещё не записано.
            </Typography>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Период</TableHead>
                  <TableHead>Комментарий</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.paidAt)}</TableCell>
                    <TableCell>{formatMoney(payment.amount, payment.currency)}</TableCell>
                    <TableCell>{`${formatDate(payment.periodStart)} — ${formatDate(payment.periodEnd)}`}</TableCell>
                    <TableCell>{payment.note ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Удалить платёж"
                        onClick={() => setDeletingPaymentId(payment.id)}
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                        <Typography variant="srOnly">Удалить платёж</Typography>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {server.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Заметки</CardTitle>
          </CardHeader>
          <CardContent>
            <Typography variant="bodySm" className="whitespace-pre-wrap">
              {server.notes}
            </Typography>
          </CardContent>
        </Card>
      )}

      <ServerFormDialog open={editing} onOpenChange={setEditing} server={server} />
      <ServerPaymentDialog
        server={paying}
        onOpenChange={(open) => {
          if (!open) setPaying(null)
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Удалить сервер «${server.name}»?`}
        description="История оплат будет удалена, проекты останутся без привязки к серверу."
        pending={deleteServer.isPending}
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={deletingPaymentId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingPaymentId(null)
        }}
        title="Удалить запись об оплате?"
        description="Срок «оплачен до» пересчитается по оставшимся платежам."
        pending={deletePayment.isPending}
        onConfirm={handleDeletePayment}
      />
    </>
  )
}
