import { Add01Icon, Delete02Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ClientDto } from '@projects-hq/contracts'
import { useState } from 'react'
import { toast } from 'sonner'

import { ClientFormDialog } from '@/components/clients/client-form-dialog'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Typography } from '@/components/ui/typography'
import { formatMoneyList } from '@/lib/format'
import { useClients, useDeleteClient } from '@/lib/queries'

export function ClientsPage() {
  const clients = useClients()
  const deleteClient = useDeleteClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ClientDto | undefined>(undefined)
  const [deleting, setDeleting] = useState<ClientDto | null>(null)

  function openCreate() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function handleDelete() {
    if (!deleting) return
    deleteClient.mutate(deleting.id, {
      onSuccess: () => {
        toast.success('Клиент удалён')
        setDeleting(null)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  const rows = clients.data?.clients ?? []

  return (
    <>
      <PageHeader title="Клиенты" description="Заказчики проектов и их задолженность по выставленным счетам.">
        <Button type="button" onClick={openCreate}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          Добавить клиента
        </Button>
      </PageHeader>

      {clients.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить клиентов</AlertTitle>
          <AlertDescription>{clients.error.message}</AlertDescription>
        </Alert>
      )}

      {clients.isPending ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <EmptyState title="Клиентов пока нет" description="Добавьте заказчика, чтобы привязывать к нему проекты и счета.">
          <Button type="button" onClick={openCreate}>
            Добавить клиента
          </Button>
        </EmptyState>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Клиент</TableHead>
                  <TableHead>Контакты</TableHead>
                  <TableHead>Проекты</TableHead>
                  <TableHead>К оплате</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div className="grid gap-0.5">
                        <Typography variant="bodySmMedium">{client.name}</Typography>
                        {client.contactName && (
                          <Typography variant="caption" tone="muted">
                            {client.contactName}
                          </Typography>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-0.5">
                        {[client.email, client.phone, client.telegram].filter(Boolean).map((contact) => (
                          <Typography key={contact} variant="caption">
                            {contact}
                          </Typography>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{client.projectCount}</TableCell>
                    <TableCell>{formatMoneyList(client.outstanding)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Изменить"
                          onClick={() => {
                            setEditing(client)
                            setFormOpen(true)
                          }}
                        >
                          <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                          <Typography variant="srOnly">Изменить</Typography>
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" title="Удалить" onClick={() => setDeleting(client)}>
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

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editing} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Удалить клиента «${deleting?.name ?? ''}»?`}
        description="Проекты останутся без клиента. Клиента со счетами удалить нельзя."
        pending={deleteClient.isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
