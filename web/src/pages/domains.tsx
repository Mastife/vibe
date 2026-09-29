import { Add01Icon, Delete02Icon, Edit02Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { DomainDto } from '@projects-hq/contracts'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DomainFormDialog } from '@/components/domains/domain-form-dialog'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { ServerPaymentBadge } from '@/components/status-badges'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Typography } from '@/components/ui/typography'
import { formatMoney } from '@/lib/format'
import { useDeleteDomain, useDomains, useProjects, useSyncDomains } from '@/lib/queries'

export function DomainsPage() {
  const domains = useDomains()
  const projects = useProjects()
  const deleteDomain = useDeleteDomain()
  const syncDomains = useSyncDomains()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DomainDto | undefined>(undefined)
  const [deleting, setDeleting] = useState<DomainDto | null>(null)

  function openCreate() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function handleSync() {
    syncDomains.mutate(undefined, {
      onSuccess: (result) =>
        toast.success(`Проверено ${result.checked}: обновлено ${result.updated}, ошибок ${result.failed}`),
      onError: (error) => toast.error(error.message),
    })
  }

  function handleDelete() {
    if (!deleting) return
    deleteDomain.mutate(deleting.id, {
      onSuccess: () => {
        toast.success('Домен удалён')
        setDeleting(null)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  const rows = domains.data?.domains ?? []

  return (
    <>
      <PageHeader title="Домены" description="Сроки продления доменов и напоминания об оплате в Telegram.">
        <Button type="button" variant="outline" onClick={handleSync} disabled={syncDomains.isPending || rows.length === 0}>
          <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} data-icon="inline-start" />
          {syncDomains.isPending ? 'Проверяем...' : 'Обновить сроки'}
        </Button>
        <Button type="button" onClick={openCreate}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          Добавить домен
        </Button>
      </PageHeader>

      {domains.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить домены</AlertTitle>
          <AlertDescription>{domains.error.message}</AlertDescription>
        </Alert>
      )}

      {domains.isPending ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Доменов пока нет"
          description="Добавьте домен с датой окончания, чтобы бот напомнил о продлении за 30, 7 и 1 день."
        >
          <Button type="button" onClick={openCreate}>
            Добавить домен
          </Button>
        </EmptyState>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Домен</TableHead>
                  <TableHead>Проект</TableHead>
                  <TableHead>Продление</TableHead>
                  <TableHead>Срок</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((domain) => (
                  <TableRow key={domain.id}>
                    <TableCell>
                      <div className="grid gap-0.5">
                        <Typography asChild variant="bodySmMedium">
                          <a href={`https://${domain.name}`} target="_blank" rel="noreferrer" className="hover:underline">
                            {domain.name}
                          </a>
                        </Typography>
                        <Typography variant="caption" tone="muted">
                          {domain.registrar ?? 'Регистратор не указан'}
                        </Typography>
                      </div>
                    </TableCell>
                    <TableCell>
                      {domain.project ? (
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: domain.project.id }}
                          className="hover:underline"
                        >
                          {domain.project.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{domain.renewalCost > 0 ? formatMoney(domain.renewalCost, domain.currency) : '—'}</TableCell>
                    <TableCell>
                      <ServerPaymentBadge
                        state={domain.renewal.state}
                        daysLeft={domain.renewal.daysLeft}
                        paidUntil={domain.expiresAt}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Изменить"
                          onClick={() => {
                            setEditing(domain)
                            setFormOpen(true)
                          }}
                        >
                          <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                          <Typography variant="srOnly">Изменить</Typography>
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" title="Удалить" onClick={() => setDeleting(domain)}>
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

      <DomainFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        domain={editing}
        projects={projects.data?.projects ?? []}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Удалить домен «${deleting?.name ?? ''}»?`}
        description="Напоминания о его продлении перестанут приходить."
        pending={deleteDomain.isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
