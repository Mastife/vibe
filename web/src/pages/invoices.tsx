import { Add01Icon, CheckmarkCircle02Icon, Delete02Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { InvoiceDto, InvoiceStatus } from '@projects-hq/contracts'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { InvoiceFormDialog } from '@/components/invoices/invoice-form-dialog'
import { PageHeader } from '@/components/page-header'
import { InvoiceStatusBadge } from '@/components/status-badges'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Typography } from '@/components/ui/typography'
import { formatDate, formatMoney, formatMoneyList } from '@/lib/format'
import { invoiceStatusLabels } from '@/lib/labels'
import { useClients, useDeleteInvoice, useInvoices, useProjects, useUpdateInvoice } from '@/lib/queries'

type StatusFilter = 'ALL' | InvoiceStatus

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Все' },
  ...(Object.entries(invoiceStatusLabels) as Array<[InvoiceStatus, string]>).map(([value, label]) => ({ value, label })),
]

export function InvoicesPage() {
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const invoices = useInvoices(filter === 'ALL' ? {} : { status: filter })
  const clients = useClients()
  const projects = useProjects()
  const updateInvoice = useUpdateInvoice()
  const deleteInvoice = useDeleteInvoice()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<InvoiceDto | undefined>(undefined)
  const [deleting, setDeleting] = useState<InvoiceDto | null>(null)

  const rows = invoices.data?.invoices ?? []
  const outstanding = rows.filter((invoice) => invoice.status === 'SENT')

  function openCreate() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function markPaid(invoice: InvoiceDto) {
    updateInvoice.mutate(
      { id: invoice.id, payload: { status: 'PAID' } },
      {
        onSuccess: () => toast.success(`Счёт «${invoice.title}» отмечен оплаченным`),
        onError: (error) => toast.error(error.message),
      },
    )
  }

  function handleDelete() {
    if (!deleting) return
    deleteInvoice.mutate(deleting.id, {
      onSuccess: () => {
        toast.success('Счёт удалён')
        setDeleting(null)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <>
      <PageHeader
        title="Счета"
        description={
          outstanding.length > 0
            ? `Ожидают оплаты: ${formatMoneyList(outstanding)}`
            : 'Выставленные счета и их оплата по клиентам.'
        }
      >
        <Button type="button" onClick={openCreate} disabled={(clients.data?.clients.length ?? 0) === 0}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          Выставить счёт
        </Button>
      </PageHeader>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as StatusFilter)}>
        <TabsList>
          {statusFilters.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {invoices.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить счета</AlertTitle>
          <AlertDescription>{invoices.error.message}</AlertDescription>
        </Alert>
      )}

      {invoices.isPending ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Счетов нет"
          description={
            (clients.data?.clients.length ?? 0) === 0
              ? 'Сначала добавьте клиента, затем выставляйте ему счета.'
              : 'Выставьте счёт клиенту, чтобы отслеживать оплату и сроки.'
          }
        >
          {(clients.data?.clients.length ?? 0) > 0 && (
            <Button type="button" onClick={openCreate}>
              Выставить счёт
            </Button>
          )}
        </EmptyState>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Счёт</TableHead>
                  <TableHead>Клиент</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Выставлен</TableHead>
                  <TableHead>Срок</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <div className="grid gap-0.5">
                        <Typography variant="bodySmMedium">{invoice.title}</Typography>
                        {invoice.projectName && (
                          <Typography variant="caption" tone="muted">
                            {invoice.projectName}
                          </Typography>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{invoice.clientName}</TableCell>
                    <TableCell>{formatMoney(invoice.amount, invoice.currency)}</TableCell>
                    <TableCell>{formatDate(invoice.issuedAt)}</TableCell>
                    <TableCell>{formatDate(invoice.dueAt)}</TableCell>
                    <TableCell>
                      <InvoiceStatusBadge invoice={invoice} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {(invoice.status === 'SENT' || invoice.status === 'DRAFT') && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={updateInvoice.isPending}
                            onClick={() => markPaid(invoice)}
                          >
                            <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} data-icon="inline-start" />
                            Оплачен
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Изменить"
                          onClick={() => {
                            setEditing(invoice)
                            setFormOpen(true)
                          }}
                        >
                          <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                          <Typography variant="srOnly">Изменить</Typography>
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" title="Удалить" onClick={() => setDeleting(invoice)}>
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

      <InvoiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        invoice={editing}
        clients={clients.data?.clients ?? []}
        projects={projects.data?.projects ?? []}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Удалить счёт «${deleting?.title ?? ''}»?`}
        description="Запись о счёте будет удалена безвозвратно."
        pending={deleteInvoice.isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
