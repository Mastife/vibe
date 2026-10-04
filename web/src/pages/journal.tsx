import type { TaskDto, TaskStatus } from '@projects-hq/contracts'
import { useState } from 'react'

import { JournalComposer, JournalTimeline } from '@/components/journal/journal'
import { TaskList, TaskQuickAdd } from '@/components/journal/tasks'
import { PageHeader } from '@/components/page-header'
import { StatusDot } from '@/components/status-badges'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Typography } from '@/components/ui/typography'
import { taskStatusLabels } from '@/lib/labels'
import { useJournal, useProjects, useTasks } from '@/lib/queries'

/** Finished tasks kept on the board; older ones stay on their project page. */
const doneOnBoard = 15

const columns: Array<{ status: TaskStatus; empty: string }> = [
  { status: 'TODO', empty: 'Очередь пуста' },
  { status: 'IN_PROGRESS', empty: 'Ничего не в работе' },
  { status: 'DONE', empty: 'Пока ничего не закрыто' },
]

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'critical' | 'warning' | 'good' }) {
  return (
    <div className="grid gap-0.5 rounded-xl bg-muted/40 px-3 py-2.5">
      <span className="flex items-center gap-1.5">
        {tone && value > 0 && <StatusDot tone={tone} />}
        <Typography as="span" variant="h4" className="tabular-nums">
          {value}
        </Typography>
      </span>
      <Typography as="span" variant="caption" tone="muted">
        {label}
      </Typography>
    </div>
  )
}

export function JournalPage() {
  const [projectId, setProjectId] = useState('')
  const query = projectId ? { projectId } : {}
  const projects = useProjects()
  const tasks = useTasks(query)
  const journal = useJournal(query)

  const allProjects = projects.data?.projects ?? []
  const pickable = allProjects.filter((project) => project.status !== 'ARCHIVED')
  const all: TaskDto[] = tasks.data?.tasks ?? []
  const byStatus = (status: TaskStatus) => all.filter((task) => task.status === status)
  const open = all.filter((task) => task.status !== 'DONE')

  return (
    <>
      <PageHeader title="Журнал" description="Задачи и история по всем проектам.">
        <NativeSelect aria-label="Проект" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <NativeSelectOption value="">Все проекты</NativeSelectOption>
          {allProjects.map((project) => (
            <NativeSelectOption key={project.id} value={project.id}>
              {project.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </PageHeader>

      {(tasks.isError || journal.isError) && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить журнал</AlertTitle>
          <AlertDescription>{(tasks.error ?? journal.error)?.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Новая запись</CardTitle>
          <CardDescription>Созвон, решение, договорённость. С любой страницы запись открывается клавишей N.</CardDescription>
        </CardHeader>
        <CardContent>
          <JournalComposer
            // A new filter means a new default project in the picker.
            key={projectId}
            projects={pickable}
            defaultProjectId={projectId}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="открытых задач" value={open.length} />
        <Tile label="в работе" value={byStatus('IN_PROGRESS').length} tone="warning" />
        <Tile label="просрочено" value={open.filter((task) => task.isOverdue).length} tone="critical" />
        <Tile label="выполнено" value={byStatus('DONE').length} tone="good" />
      </div>

      <Tabs defaultValue="tasks" className="gap-4">
        <TabsList>
          <TabsTrigger value="tasks">Задачи</TabsTrigger>
          <TabsTrigger value="history">История</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="grid gap-4">
          <TaskQuickAdd projectId={projectId || undefined} projects={pickable} />
          {tasks.isPending ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-3">
              {columns.map((column) => {
                const items = byStatus(column.status)
                return (
                  <Card key={column.status}>
                    <CardHeader>
                      <CardTitle>{`${taskStatusLabels[column.status]} · ${items.length}`}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TaskList
                        tasks={column.status === 'DONE' ? items.slice(0, doneOnBoard) : items}
                        showProject={!projectId}
                        emptyText={column.empty}
                      />
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent>
              {journal.isPending ? (
                <Skeleton className="h-40" />
              ) : (
                <JournalTimeline entries={journal.data?.entries ?? []} showProject={!projectId} pageSize={20} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}
