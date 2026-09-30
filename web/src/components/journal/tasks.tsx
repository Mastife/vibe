import { PauseIcon, PlayIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { taskCreateSchema, taskUpdateSchema, type ProjectDto, type TaskDto, type TaskStatus } from '@projects-hq/contracts'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { EntityDialog } from '@/components/entity-dialog'
import { FormField } from '@/components/form-field'
import { StatusDot } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogFooter } from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Typography } from '@/components/ui/typography'
import { plural } from '@/lib/format'
import { taskDueLabel, taskStatusLabels } from '@/lib/labels'
import { useCreateTask, useDeleteTask, useUpdateTask } from '@/lib/queries'
import { cn } from '@/lib/utils'

const taskStatuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE']

function dueTone(task: TaskDto): 'critical' | 'warning' | 'neutral' {
  if (task.isOverdue) return 'critical'
  if (task.daysLeft !== null && task.daysLeft <= 1) return 'warning'
  return 'neutral'
}

/** How far the work is: a done / in progress / waiting bar with the numbers next to it. */
export function TaskProgress({ tasks }: { tasks: TaskDto[] }) {
  const total = tasks.length
  if (total === 0) return null
  const done = tasks.filter((task) => task.status === 'DONE').length
  const active = tasks.filter((task) => task.status === 'IN_PROGRESS').length
  const overdue = tasks.filter((task) => task.isOverdue).length

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Typography as="span" variant="bodySmMedium" className="tabular-nums">
          {`${done} из ${total} выполнено`}
        </Typography>
        {overdue > 0 && (
          <span className="flex items-center gap-1.5">
            <StatusDot tone="critical" />
            <Typography as="span" variant="caption">
              {`${overdue} ${plural(overdue, ['просрочена', 'просрочены', 'просрочено'])}`}
            </Typography>
          </span>
        )}
      </div>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Выполнено ${done} из ${total}, в работе ${active}`}
      >
        <div className="h-full bg-status-good" style={{ width: `${(done / total) * 100}%` }} />
        <div className="h-full bg-status-warning" style={{ width: `${(active / total) * 100}%` }} />
      </div>
    </div>
  )
}

type TaskQuickAddProps = {
  /** Fixed project on a project page; omit to let the user pick one. */
  projectId?: string
  projects?: ProjectDto[]
}

/** One-line task entry: what to do, optionally by when. */
export function TaskQuickAdd({ projectId, projects = [] }: TaskQuickAddProps) {
  const id = useId()
  const createTask = useCreateTask()
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [pickedProject, setPickedProject] = useState('')

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const result = taskCreateSchema.safeParse({ projectId: projectId ?? pickedProject, title, dueAt })
    if (!result.success) {
      const issue = result.error.issues[0]
      toast.error(issue?.path[0] === 'projectId' ? 'Выберите проект' : issue?.path[0] === 'title' ? 'Напишите, что нужно сделать' : (issue?.message ?? 'Проверьте поля'))
      return
    }
    createTask.mutate(result.data, {
      onSuccess: () => {
        setTitle('')
        setDueAt('')
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
      <Input
        value={title}
        placeholder="Новая задача"
        aria-label="Новая задача"
        className="min-w-40 flex-1"
        onChange={(event) => setTitle(event.target.value)}
      />
      {!projectId && (
        <NativeSelect
          id={`${id}-project`}
          aria-label="Проект"
          value={pickedProject}
          onChange={(event) => setPickedProject(event.target.value)}
        >
          <NativeSelectOption value="">Проект</NativeSelectOption>
          {projects.map((project) => (
            <NativeSelectOption key={project.id} value={project.id}>
              {project.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      <Input
        type="date"
        value={dueAt}
        aria-label="Срок"
        title="Срок"
        className="w-40"
        onChange={(event) => setDueAt(event.target.value)}
      />
      <Button type="submit" disabled={createTask.isPending}>
        Добавить
      </Button>
    </form>
  )
}

function TaskRow({ task, showProject, onEdit }: { task: TaskDto; showProject: boolean; onEdit: () => void }) {
  const updateTask = useUpdateTask()
  const done = task.status === 'DONE'
  const inProgress = task.status === 'IN_PROGRESS'
  const due = taskDueLabel(task)

  function setStatus(status: TaskStatus) {
    updateTask.mutate({ id: task.id, payload: { status } }, { onError: (error) => toast.error(error.message) })
  }

  return (
    <li className="flex items-start gap-3 py-2.5">
      <Checkbox
        checked={done}
        disabled={updateTask.isPending}
        aria-label={done ? `Вернуть в работу: ${task.title}` : `Выполнено: ${task.title}`}
        className="mt-0.5"
        onCheckedChange={(checked) => setStatus(checked ? 'DONE' : 'TODO')}
      />
      <button type="button" className="grid min-w-0 flex-1 gap-0.5 text-left" title="Изменить задачу" onClick={onEdit}>
        <Typography
          as="span"
          variant="bodySm"
          tone={done ? 'muted' : 'current'}
          className={cn('break-words', done && 'line-through')}
        >
          {task.title}
        </Typography>
        {(due || showProject || inProgress) && (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {showProject && (
              <Typography as="span" variant="caption" tone="muted">
                {task.project.name}
              </Typography>
            )}
            {inProgress && (
              <span className="flex items-center gap-1.5">
                <StatusDot tone="warning" />
                <Typography as="span" variant="caption">
                  в работе
                </Typography>
              </span>
            )}
            {due && (
              <span className="flex items-center gap-1.5">
                {!done && <StatusDot tone={dueTone(task)} />}
                <Typography as="span" variant="caption" tone={task.isOverdue ? 'destructive' : 'muted'}>
                  {due}
                </Typography>
              </span>
            )}
          </span>
        )}
      </button>
      {!done && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={updateTask.isPending}
          title={inProgress ? 'Вернуть в очередь' : 'Взять в работу'}
          onClick={() => setStatus(inProgress ? 'TODO' : 'IN_PROGRESS')}
        >
          <HugeiconsIcon icon={inProgress ? PauseIcon : PlayIcon} strokeWidth={2} />
          <Typography variant="srOnly">{inProgress ? 'Вернуть в очередь' : 'Взять в работу'}</Typography>
        </Button>
      )}
    </li>
  )
}

type TaskListProps = {
  tasks: TaskDto[]
  /** Show the project name under each task on cross-project lists. */
  showProject?: boolean
  emptyText?: string
}

export function TaskList({ tasks, showProject = false, emptyText = 'Задач нет' }: TaskListProps) {
  const [editing, setEditing] = useState<TaskDto | null>(null)

  if (tasks.length === 0) {
    return (
      <Typography variant="bodySm" tone="muted">
        {emptyText}
      </Typography>
    )
  }

  return (
    <>
      <ul className="divide-y">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} showProject={showProject} onEdit={() => setEditing(task)} />
        ))}
      </ul>
      <EntityDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Задача"
        description={editing ? `Проект «${editing.project.name}»` : undefined}
      >
        {editing && <TaskEditForm task={editing} onDone={() => setEditing(null)} />}
      </EntityDialog>
    </>
  )
}

function TaskEditForm({ task, onDone }: { task: TaskDto; onDone: () => void }) {
  const id = useId()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const [title, setTitle] = useState(task.title)
  const [dueAt, setDueAt] = useState(task.dueAt ?? '')
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [titleError, setTitleError] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const result = taskUpdateSchema.safeParse({ title, dueAt, status })
    if (!result.success) {
      setTitleError('Напишите, что нужно сделать')
      return
    }
    updateTask.mutate(
      { id: task.id, payload: result.data },
      { onSuccess: onDone, onError: (error) => toast.error(error.message) },
    )
  }

  function handleDelete() {
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        toast.success('Задача удалена')
        onDone()
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup className="gap-4">
        <FormField id={`${id}-title`} label="Что сделать" errors={titleError ? [{ message: titleError }] : undefined}>
          <Input
            id={`${id}-title`}
            value={title}
            autoFocus
            aria-invalid={Boolean(titleError)}
            onChange={(event) => {
              setTitle(event.target.value)
              setTitleError(null)
            }}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={`${id}-due`} label="Срок" description="За день и в день срока бот напомнит в Telegram.">
            <Input id={`${id}-due`} type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </FormField>
          <FormField id={`${id}-status`} label="Статус">
            <NativeSelect
              id={`${id}-status`}
              className="w-full"
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
            >
              {taskStatuses.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {taskStatusLabels[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="destructive" disabled={deleteTask.isPending} onClick={handleDelete}>
            Удалить
          </Button>
          <Button type="submit" disabled={updateTask.isPending}>
            {updateTask.isPending ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}
