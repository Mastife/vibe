import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ProjectDto, ProjectStatus } from '@projects-hq/contracts'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { ProjectFormDialog } from '@/components/projects/project-form-dialog'
import { ProjectsTable } from '@/components/projects/projects-table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { projectStatusLabels } from '@/lib/labels'
import { useCheckProject, useClients, useDeleteProject, useProjects, useServers } from '@/lib/queries'

type StatusFilter = 'ALL' | ProjectStatus

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Все' },
  ...(Object.entries(projectStatusLabels) as Array<[ProjectStatus, string]>).map(([value, label]) => ({ value, label })),
]

export function ProjectsPage() {
  const projects = useProjects()
  const clients = useClients()
  const servers = useServers()
  const checkProject = useCheckProject()
  const deleteProject = useDeleteProject()
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectDto | undefined>(undefined)
  const [deleting, setDeleting] = useState<ProjectDto | null>(null)

  const visibleProjects = (projects.data?.projects ?? []).filter(
    (project) => filter === 'ALL' || project.status === filter,
  )

  function openCreate() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function openEdit(project: ProjectDto) {
    setEditing(project)
    setFormOpen(true)
  }

  function handleCheck(project: ProjectDto) {
    checkProject.mutate(project.id, {
      onSuccess: ({ run }) =>
        run.ok
          ? toast.success(`${project.name}: работает, ${run.latencyMs ?? 0} мс`)
          : toast.error(`${project.name}: ${run.error ?? 'недоступен'}`),
      onError: (error) => toast.error(error.message),
    })
  }

  function handleDelete() {
    if (!deleting) return
    deleteProject.mutate(deleting.id, {
      onSuccess: () => {
        toast.success('Проект удалён')
        setDeleting(null)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <>
      <PageHeader title="Проекты" description="Все проекты, их доступность, клиенты и серверы.">
        <Button type="button" onClick={openCreate}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
          Добавить проект
        </Button>
      </PageHeader>

      <Tabs
        value={filter}
        onValueChange={(value) => setFilter(value as StatusFilter)}
      >
        <TabsList>
          {statusFilters.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {projects.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить проекты</AlertTitle>
          <AlertDescription>{projects.error.message}</AlertDescription>
        </Alert>
      )}

      {projects.isPending ? (
        <Skeleton className="h-64" />
      ) : visibleProjects.length === 0 ? (
        <EmptyState
          title={filter === 'ALL' ? 'Проектов пока нет' : 'В этом статусе проектов нет'}
          description="Добавьте проект с адресом продакшена, чтобы следить за его доступностью."
        >
          <Button type="button" onClick={openCreate}>
            Добавить проект
          </Button>
        </EmptyState>
      ) : (
        <Card>
          <CardContent>
            <ProjectsTable
              projects={visibleProjects}
              checkingId={checkProject.isPending ? (checkProject.variables ?? null) : null}
              onCheck={handleCheck}
              onEdit={openEdit}
              onDelete={setDeleting}
            />
          </CardContent>
        </Card>
      )}

      <ProjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        project={editing}
        clients={clients.data?.clients ?? []}
        servers={servers.data?.servers ?? []}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Удалить проект «${deleting?.name ?? ''}»?`}
        description="История проверок будет удалена, счета останутся без привязки к проекту."
        pending={deleteProject.isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
