import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { JournalComposer, JournalTimeline } from '@/components/journal/journal'
import { TaskList, TaskProgress, TaskQuickAdd } from '@/components/journal/tasks'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { Typography } from '@/components/ui/typography'
import { useJournal, useTasks } from '@/lib/queries'

/** What is planned for the project and what has happened to it, side by side. */
export function ProjectWork({ projectId }: { projectId: string }) {
  const tasks = useTasks({ projectId })
  const journal = useJournal({ projectId })
  const all = tasks.data?.tasks ?? []
  const open = all.filter((task) => task.status !== 'DONE')
  const done = all.filter((task) => task.status === 'DONE')

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Задачи</CardTitle>
          <CardDescription>Перед сроком бот напомнит в Telegram.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <TaskProgress tasks={all} />
          <TaskQuickAdd projectId={projectId} />
          {tasks.isPending ? (
            <Skeleton className="h-16" />
          ) : tasks.isError ? (
            <Typography variant="bodySm" tone="destructive">
              {tasks.error.message}
            </Typography>
          ) : (
            <TaskList tasks={open} emptyText={done.length > 0 ? 'Все задачи выполнены' : 'Задач пока нет'} />
          )}
          {done.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button type="button" className="group flex items-center gap-1.5">
                  <Typography as="span" variant="caption" tone="muted">
                    {`Выполнено: ${done.length}`}
                  </Typography>
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    strokeWidth={2}
                    className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <TaskList tasks={done} />
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Журнал</CardTitle>
          <CardDescription>Ваши заметки и события, которые панель записывает сама.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <JournalComposer projectId={projectId} />
          {journal.isPending ? (
            <Skeleton className="h-16" />
          ) : journal.isError ? (
            <Typography variant="bodySm" tone="destructive">
              {journal.error.message}
            </Typography>
          ) : (
            <JournalTimeline entries={journal.data.entries} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
