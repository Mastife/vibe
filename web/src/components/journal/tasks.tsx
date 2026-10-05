import { PauseIcon, PlayIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  taskCreateSchema,
  taskUpdateSchema,
  type ProjectDto,
  type TaskDto,
  type TaskResponse,
  type TaskStatus,
} from '@projects-hq/contracts'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { EntityDialog } from '@/components/entity-dialog'
import { FormField } from '@/components/form-field'
import { SegmentedChoice, ShortcutHint } from '@/components/journal/composer-parts'
import { StatusDot } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogFooter } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Typography } from '@/components/ui/typography'
import { plural } from '@/lib/format'
import { taskDueLabel, taskStatusLabels } from '@/lib/labels'
import { toLocalDateValue } from '@/lib/local-datetime'
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

type DuePreset = 'none' | 'today' | 'tomorrow' | 'week' | 'custom'

const duePresets: Array<{ value: DuePreset; label: string; days?: number | null }> = [
  { value: 'none', label: 'Без срока', days: null },
  { value: 'today', label: 'Сегодня', days: 0 },
  { value: 'tomorrow', label: 'Завтра', days: 1 },
  { value: 'week', label: 'Через неделю', days: 7 },
  { value: 'custom', label: 'Другая дата' },
]

function presetDate(days: number | null) {
  if (days === null) return ''
  const date = new Date()
  date.setDate(date.getDate() + days)
  return toLocalDateValue(date)
}

/**
 * Deadline as quick presets; "Другая дата" reveals a date field. The field stays hidden otherwise
 * because an empty date input renders as a blank pill on iOS.
 */
function DuePicker({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const matched = duePresets.find((preset) => preset.days !== undefined && presetDate(preset.days) === value)?.value
  const [custom, setCustom] = useState(matched === undefined)
  // A cleared deadline (also after the form resets) always reads as "Без срока".
  const picked = value === '' ? 'none' : custom ? 'custom' : (matched ?? 'custom')

  function pick(preset: DuePreset) {
    if (preset === 'custom') {
      setCustom(true)
      if (value === '') onChange(presetDate(0))
      return
    }
    setCustom(false)
    onChange(presetDate(duePresets.find((item) => item.value === preset)?.days ?? null))
  }

  return (
    <Field aria-labelledby={`${id}-due`}>
      <FieldTitle id={`${id}-due`}>Срок</FieldTitle>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedChoice aria-labelledby={`${id}-due`} options={duePresets} value={picked} onChange={pick} />
        {picked === 'custom' && (
          <Input
            type="date"
            aria-label="Дата срока"
            value={value}
            className="w-auto"
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </div>
    </Field>
  )
}

type TaskComposerProps = {
  /** Fixed project on a project page; omit to let the user pick one. */
  projectId?: string
  projects?: ProjectDto[]
  /** Project picked up front when the user can still change it. */
  defaultProjectId?: string
  autoFocus?: boolean
  onSaved?: (response: TaskResponse) => void
  /** Shows a cancel button next to the submit one, for the composer inside a dialog. */
  onCancel?: () => void
}

/** New task: what to do, for which project, and optionally by when. Enter adds it. */
export function TaskComposer({
  projectId,
  projects = [],
  defaultProjectId = '',
  autoFocus = false,
  onSaved,
  onCancel,
}: TaskComposerProps) {
  const id = useId()
  const createTask = useCreateTask()
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [pickedProject, setPickedProject] = useState(defaultProjectId)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const result = taskCreateSchema.safeParse({ projectId: projectId ?? pickedProject, title, dueAt })
    if (!result.success) {
      const issue = result.error.issues[0]
      toast.error(issue?.path[0] === 'projectId' ? 'Выберите проект' : issue?.path[0] === 'title' ? 'Напишите, что нужно сделать' : (issue?.message ?? 'Проверьте поля'))
      return
    }
    createTask.mutate(result.data, {
      onSuccess: (response) => {
        setTitle('')
        setDueAt('')
        onSaved?.(response)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <Field className="min-w-0 flex-1 basis-60">
          <FieldLabel htmlFor={`${id}-title`}>Что сделать</FieldLabel>
          <Input
            id={`${id}-title`}
            value={title}
            autoFocus={autoFocus}
            placeholder="Отправить клиенту отчёт за сентябрь"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        {!projectId && (
          <Field className="w-full sm:w-56">
            <FieldLabel htmlFor={`${id}-project`}>Проект</FieldLabel>
            <NativeSelect
              id={`${id}-project`}
              value={pickedProject}
              onChange={(event) => setPickedProject(event.target.value)}
            >
              <NativeSelectOption value="">Выберите проект</NativeSelectOption>
              {projects.map((project) => (
                <NativeSelectOption key={project.id} value={project.id}>
                  {project.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>
      <DuePicker id={id} value={dueAt} onChange={setDueAt} />
      <div className="flex items-center gap-2">
        <ShortcutHint keys="enter" action="добавить" />
        <div className="ml-auto flex gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Отмена
            </Button>
          )}
          <Button type="submit" disabled={createTask.isPending}>
            Добавить задачу
          </Button>
        </div>
      </div>
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
        <DuePicker id={id} value={dueAt} onChange={setDueAt} />
        <Field aria-labelledby={`${id}-status`}>
          <FieldTitle id={`${id}-status`}>Статус</FieldTitle>
          <SegmentedChoice
            aria-labelledby={`${id}-status`}
            options={taskStatuses.map((value) => ({ value, label: taskStatusLabels[value] }))}
            value={status}
            onChange={setStatus}
          />
        </Field>
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
