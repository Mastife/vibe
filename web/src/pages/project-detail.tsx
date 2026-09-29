import { Delete02Icon, Edit02Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { PageHeader } from '@/components/page-header'
import { HealthHistoryChart } from '@/components/projects/health-history-chart'
import { ProjectFormDialog } from '@/components/projects/project-form-dialog'
import { HealthBadge, InvoiceStatusBadge, ProjectStatusBadge } from '@/components/status-badges'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Typography } from '@/components/ui/typography'
import {
  formatDate,
  formatDateTime,
  formatDays,
  formatLatency,
  formatMoney,
  formatPercent,
  formatRelative,
} from '@/lib/format'
import { useCheckProject, useClients, useDeleteProject, useProject, useServers } from '@/lib/queries'

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

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

function ExternalLink({ href }: { href: string }) {
  return (
    <Typography asChild variant="bodySm">
      <a href={href} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">
        {href}
      </a>
    </Typography>
  )
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ from: '/projects/$projectId' })
  const navigate = useNavigate()
  const detail = useProject(projectId)
  const clients = useClients()
  const servers = useServers()
  const checkProject = useCheckProject()
  const deleteProject = useDeleteProject()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (detail.isPending) {
    return <Skeleton className="h-96" />
  }

  if (detail.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Не удалось загрузить проект</AlertTitle>
        <AlertDescription>{detail.error.message}</AlertDescription>
      </Alert>
    )
  }

  const { project, healthRuns, invoices } = detail.data
  const monitoredUrl = project.healthCheckUrl ?? project.productionUrl
  const sslDays = daysUntil(project.health.sslExpiresAt)

  function handleCheck() {
    checkProject.mutate(project.id, {
      onSuccess: ({ run }) =>
        run.ok
          ? toast.success(`Работает: HTTP ${run.statusCode ?? '—'}, ${run.latencyMs ?? 0} мс`)
          : toast.error(run.error ?? 'Проверка не прошла'),
      onError: (error) => toast.error(error.message),
    })
  }

  function handleDelete() {
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        toast.success('Проект удалён')
        void navigate({ to: '/projects' })
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <>
      <PageHeader title={project.name} description={project.description ?? undefined}>
        <Button type="button" variant="outline" onClick={handleCheck} disabled={!monitoredUrl || checkProject.isPending}>
          <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} data-icon="inline-start" />
          {checkProject.isPending ? 'Проверяем...' : 'Проверить сейчас'}
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
        <ProjectStatusBadge status={project.status} />
        <HealthBadge status={project.health.status} />
        {project.tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Мониторинг</CardTitle>
            <CardDescription>
              {monitoredUrl ? `Проверяется ${monitoredUrl}` : 'Укажите адрес продакшена, чтобы включить проверки.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Fact label="Последняя проверка">
              {project.health.checkedAt
                ? `${formatRelative(project.health.checkedAt)} · ${formatDateTime(project.health.checkedAt)}`
                : 'ещё не проверялся'}
            </Fact>
            <Fact label="Ответ">
              {project.health.statusCode ? `HTTP ${project.health.statusCode}, ` : ''}
              {formatLatency(project.health.latencyMs)}
            </Fact>
            <Fact label="Аптайм 24 ч / 7 дней">
              {`${formatPercent(project.health.uptime24h)} / ${formatPercent(project.health.uptime7d)}`}
            </Fact>
            <Fact label="SSL-сертификат">
              {project.health.sslExpiresAt && sslDays !== null
                ? `до ${formatDate(project.health.sslExpiresAt.slice(0, 10))}${sslDays >= 0 ? ` (${formatDays(sslDays)})` : ' (истёк)'}`
                : '—'}
            </Fact>
            {project.health.error && (
              <Fact label="Ошибка">
                <Typography as="span" variant="bodySm" tone="destructive">
                  {project.health.error}
                </Typography>
              </Fact>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Данные проекта</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Fact label="Клиент">
              {project.client ? (
                <Link to="/clients" className="underline underline-offset-4">
                  {project.client.name}
                </Link>
              ) : (
                '—'
              )}
            </Fact>
            <Fact label="Сервер">
              {project.server ? (
                <Link
                  to="/servers/$serverId"
                  params={{ serverId: project.server.id }}
                  className="underline underline-offset-4"
                >
                  {project.server.name}
                </Link>
              ) : (
                '—'
              )}
            </Fact>
            <Fact label="Плата клиента">
              {project.monthlyFee === null ? '—' : `${formatMoney(project.monthlyFee, project.currency)} / мес`}
            </Fact>
            <Fact label="Slug">{project.slug}</Fact>
            <Fact label="Продакшен">{project.productionUrl ? <ExternalLink href={project.productionUrl} /> : '—'}</Fact>
            <Fact label="Health-check">{project.healthCheckUrl ? <ExternalLink href={project.healthCheckUrl} /> : '—'}</Fact>
            <Fact label="Репозиторий">{project.repoUrl ? <ExternalLink href={project.repoUrl} /> : '—'}</Fact>
            <Fact label="Активность в репозитории">
              {project.repo.pushedAt
                ? `последний push ${formatRelative(project.repo.pushedAt)}${project.repo.openIssues !== null ? `, открытых issues: ${project.repo.openIssues}` : ''}`
                : 'нет данных (нужен GITHUB_TOKEN)'}
            </Fact>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>История проверок</CardTitle>
          <CardDescription>Время ответа успешных проверок и отметки сбоев за последние сутки.</CardDescription>
        </CardHeader>
        <CardContent>
          <HealthHistoryChart runs={healthRuns} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Счета по проекту</CardTitle>
          <CardDescription>
            <Link to="/invoices" className="underline underline-offset-4">
              Все счета
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <Typography variant="bodySm" tone="muted">
              Счетов по этому проекту пока нет.
            </Typography>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Счёт</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Выставлен</TableHead>
                  <TableHead>Срок</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{invoice.title}</TableCell>
                    <TableCell>{formatMoney(invoice.amount, invoice.currency)}</TableCell>
                    <TableCell>{formatDate(invoice.issuedAt)}</TableCell>
                    <TableCell>{formatDate(invoice.dueAt)}</TableCell>
                    <TableCell>
                      <InvoiceStatusBadge invoice={invoice} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {project.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Заметки</CardTitle>
          </CardHeader>
          <CardContent>
            <Typography variant="bodySm" className="whitespace-pre-wrap">
              {project.notes}
            </Typography>
          </CardContent>
        </Card>
      )}

      <ProjectFormDialog
        open={editing}
        onOpenChange={setEditing}
        project={project}
        clients={clients.data?.clients ?? []}
        servers={servers.data?.servers ?? []}
      />

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Удалить проект «${project.name}»?`}
        description="История проверок будет удалена, счета останутся без привязки к проекту."
        pending={deleteProject.isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
