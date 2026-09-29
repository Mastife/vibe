import { Add01Icon, CreditCardIcon, Delete02Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ServerDto } from '@projects-hq/contracts'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { ServerFormDialog } from '@/components/servers/server-form-dialog'
import { billingPeriodLabels } from '@/lib/labels'
import { ServerPaymentDialog } from '@/components/servers/server-payment-dialog'
import { ServerPaymentBadge, ServerStatusBadge } from '@/components/status-badges'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Typography } from '@/components/ui/typography'
import { formatMoney } from '@/lib/format'
import { useDeleteServer, useServers } from '@/lib/queries'

export function ServersPage() {
  const servers = useServers()
  const deleteServer = useDeleteServer()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ServerDto | undefined>(undefined)
  const [paying, setPaying] = useState<ServerDto | null>(null)
  const [deleting, setDeleting] = useState<ServerDto | null>(null)

  function openCreate() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function handleDelete() {
    if (!deleting) return
    deleteServer.mutate(deleting.id, {
      onSuccess: () => {
        toast.success('Сервер удалён')
        setDeleting(null)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  const rows = servers.data?.servers ?? []

  return (
    <>
      <PageHeader title="Серверы" description="VPS и хостинг: стоимость, сроки оплаты и размещённые проекты.">
        <Button type="button" onClick={openCreate}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          Добавить сервер
        </Button>
      </PageHeader>

      {servers.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить серверы</AlertTitle>
          <AlertDescription>{servers.error.message}</AlertDescription>
        </Alert>
      )}

      {servers.isPending ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <EmptyState title="Серверов пока нет" description="Добавьте VPS с датой «оплачен до», чтобы получать напоминания об оплате.">
          <Button type="button" onClick={openCreate}>
            Добавить сервер
          </Button>
        </EmptyState>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Сервер</TableHead>
                  <TableHead>Проекты</TableHead>
                  <TableHead>Стоимость</TableHead>
                  <TableHead>Оплата</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((server) => (
                  <TableRow key={server.id}>
                    <TableCell>
                      <div className="grid gap-0.5">
                        <Typography asChild variant="bodySmMedium">
                          <Link to="/servers/$serverId" params={{ serverId: server.id }} className="hover:underline">
                            {server.name}
                          </Link>
                        </Typography>
                        <Typography variant="caption" tone="muted">
                          {[server.provider, server.host].filter(Boolean).join(' · ') || '—'}
                        </Typography>
                      </div>
                    </TableCell>
                    <TableCell>{server.projects.length}</TableCell>
                    <TableCell>
                      {`${formatMoney(server.monthlyCost, server.currency)} · ${billingPeriodLabels[server.billingPeriod].toLowerCase()}`}
                    </TableCell>
                    <TableCell>
                      <ServerPaymentBadge
                        state={server.payment.state}
                        daysLeft={server.payment.daysLeft}
                        paidUntil={server.paidUntil}
                      />
                    </TableCell>
                    <TableCell>
                      <ServerStatusBadge status={server.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="outline" size="sm" onClick={() => setPaying(server)}>
                          <HugeiconsIcon icon={CreditCardIcon} strokeWidth={2} data-icon="inline-start" />
                          Оплатить
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Изменить"
                          onClick={() => {
                            setEditing(server)
                            setFormOpen(true)
                          }}
                        >
                          <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                          <Typography variant="srOnly">Изменить</Typography>
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" title="Удалить" onClick={() => setDeleting(server)}>
                          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                          <Typography variant="srOnly">Удалить</Typography>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ServerFormDialog open={formOpen} onOpenChange={setFormOpen} server={editing} />
      <ServerPaymentDialog
        server={paying}
        onOpenChange={(open) => {
          if (!open) setPaying(null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Удалить сервер «${deleting?.name ?? ''}»?`}
        description="История оплат будет удалена, проекты останутся без привязки к серверу."
        pending={deleteServer.isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
