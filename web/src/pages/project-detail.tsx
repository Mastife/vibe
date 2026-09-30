import { ArrowDown01Icon, Delete02Icon, Edit02Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { ProjectWork } from '@/components/journal/project-work'
import { HealthHistoryChart, HealthRunsTable } from '@/components/projects/health-history-chart'
import { ProjectFormDialog } from '@/components/projects/project-form-dialog'
import {
  HealthHero,
  PilotTimeline,
  ProjectChips,
  RemainingBar,
  UptimeRing,
} from '@/components/projects/project-overview'
import { InvoiceStatusBadge, ProjectStatusBadge } from '@/components/status-badges'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Typography } from '@/components/ui/typography'
import { formatDate, formatDateTime, formatMoney, formatRelative } from '@/lib/format'
import { useCheckProject, useClients, useDeleteProject, useProject, useServers } from '@/lib/queries'

function daysUntil(iso: string | null, now: number): number | null {
  if (!iso) return null
  return Math.round((new Date(iso).getTime() - now) / 86_400_000)
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <Typography variant="caption" tone="muted">
        {label}
      </Typography>
      <Typography as="div" variant="bodySm" className="break-words">
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
  // Read once per mount: day counts do not need to tick while the page is open.
  const [now] = useState(() => Date.now())

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
  const target = project.monitorTarget
  const sslExpiresAt = project.health.sslExpiresAt
  const sslDays = daysUntil(sslExpiresAt, now)

  function handleCheck() {
    checkProject.mutate(project.id, {
      onSuccess: ({ run }) =>
        run.ok ? toast.success(`Работает, ответ ${run.latencyMs ?? 0} мс`) : toast.error(run.error ?? 'Проверка не прошла'),
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-2">
          <Typography variant="h3" className="break-words">
            {project.name}
          </Typography>
          <div className="flex flex-wrap items-center gap-1.5">
            <ProjectStatusBadge status={project.status} />
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Проверить сейчас"
            onClick={handleCheck}
            disabled={!target || checkProject.isPending}
          >
            <HugeiconsIcon
              icon={Refresh01Icon}
              strokeWidth={2}
              className={checkProject.isPending ? 'animate-spin' : undefined}
            />
            <Typography variant="srOnly">Проверить сейчас</Typography>
          </Button>
          <Button type="button" variant="outline" size="icon" title="Изменить" onClick={() => setEditing(true)}>
            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
            <Typography variant="srOnly">Изменить</Typography>
          </Button>
          <Button type="button" variant="outline" size="icon" title="Удалить" onClick={() => setDeleting(true)}>
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            <Typography variant="srOnly">Удалить</Typography>
          </Button>
        </div>
      </div>

      <HealthHero project={project} />

      {(target || project.pilot.endsAt) && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {target && <UptimeRing label="аптайм за сутки" value={project.health.uptime24h} />}
          {target && <UptimeRing label="аптайм за неделю" value={project.health.uptime7d} />}
          {sslExpiresAt && (
            <RemainingBar
              label="SSL-сертификат"
              daysLeft={sslDays}
              totalDays={90}
              warnBelow={21}
              criticalBelow={7}
              caption={`до ${formatDate(sslExpiresAt.slice(0, 10))}`}
            />
          )}
          <PilotTimeline project={project} />
        </div>
      )}

      <ProjectChips project={project} />

      <ProjectWork projectId={project.id} />

      {target && healthRuns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Время ответа за сутки</CardTitle>
            <CardDescription>Красные точки — неудачные проверки.</CardDescription>
          </CardHeader>
          <CardContent>
            <HealthHistoryChart runs={healthRuns} withTable={false} />
          </CardContent>
        </Card>
      )}

      {invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Счета</CardTitle>
            <CardDescription>
              <Link to="/invoices" className="underline underline-offset-4">
                Все счета
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Счёт</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Срок</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{invoice.title}</TableCell>
                    <TableCell>{formatMoney(invoice.amount, invoice.currency)}</TableCell>
                    <TableCell>{formatDate(invoice.dueAt)}</TableCell>
                    <TableCell>
                      <InvoiceStatusBadge invoice={invoice} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Collapsible className="rounded-2xl border">
        <CollapsibleTrigger asChild>
          <button type="button" className="group flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
            <span className="grid gap-0.5">
              <Typography as="span" variant="bodySmMedium">
                Технические детали
              </Typography>
              <Typography as="span" variant="caption" tone="muted">
                {`Описание, адреса, репозиторий, журнал проверок${project.notes ? ', заметки' : ''}`}
              </Typography>
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2}
              className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-6 border-t px-5 py-4">
          {project.description && (
            <Typography variant="bodySm" className="break-words">
              {project.description}
            </Typography>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Fact label="Что проверяется">{target ?? '—'}</Fact>
            <Fact label="Последняя проверка">
              {project.health.checkedAt
                ? `${formatDateTime(project.health.checkedAt)}${project.health.statusCode ? ` · HTTP ${project.health.statusCode}` : ''}`
                : '—'}
            </Fact>
            <Fact label="Продакшен">{project.productionUrl ? <ExternalLink href={project.productionUrl} /> : '—'}</Fact>
            <Fact label="Health-check">
              {project.healthCheckUrl ? <ExternalLink href={project.healthCheckUrl} /> : '—'}
            </Fact>
            <Fact label="Репозиторий">{project.repoUrl ? <ExternalLink href={project.repoUrl} /> : '—'}</Fact>
            <Fact label="Активность в репозитории">
              {project.repo.pushedAt
                ? `последний push ${formatRelative(project.repo.pushedAt)}${project.repo.openIssues !== null ? `, открытых issues: ${project.repo.openIssues}` : ''}`
                : '—'}
            </Fact>
            <Fact label="Slug">{project.slug}</Fact>
            {project.tags.length > 0 && (
              <Fact label="Теги">
                <span className="flex flex-wrap gap-1">
                  {project.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </span>
              </Fact>
            )}
          </div>
          {healthRuns.length > 0 && (
            <div className="grid gap-2">
              <Typography variant="bodySmMedium">Журнал проверок</Typography>
              <HealthRunsTable runs={healthRuns} />
            </div>
          )}
          {project.notes && (
            <div className="grid gap-2">
              <Typography variant="bodySmMedium">Заметки</Typography>
              <Typography variant="bodySm" className="break-words whitespace-pre-wrap">
                {project.notes}
              </Typography>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

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
