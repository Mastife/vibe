import { Delete02Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  journalEntryCreateSchema,
  journalEntryUpdateSchema,
  type JournalEntryDto,
  type JournalEntryResponse,
  type ProjectDto,
} from '@projects-hq/contracts'
import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SegmentedChoice, ShortcutHint } from '@/components/journal/composer-parts'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Typography } from '@/components/ui/typography'
import { formatDateTime } from '@/lib/format'
import { submitOnShortcut } from '@/lib/keyboard'
import { fromLocalInputValue, toLocalInputValue } from '@/lib/local-datetime'
import { useCreateJournalEntry, useDeleteJournalEntry, useUpdateJournalEntry } from '@/lib/queries'
import { cn } from '@/lib/utils'

const dayMs = 24 * 60 * 60 * 1000

type When = 'now' | 'yesterday' | 'custom'

const whenOptions: Array<{ value: When; label: string }> = [
  { value: 'now', label: 'Сейчас' },
  { value: 'yesterday', label: 'Вчера' },
  { value: 'custom', label: 'Другое время' },
]

type JournalComposerProps = {
  /** Fixed project on a project page; omit to let the user pick one. */
  projectId?: string
  projects?: ProjectDto[]
  /** Project picked up front when the user can still change it. */
  defaultProjectId?: string
  autoFocus?: boolean
  onSaved?: (response: JournalEntryResponse) => void
  /** Shows a cancel button next to the submit one, for the composer inside a dialog. */
  onCancel?: () => void
}

/**
 * Writes a note into the project's history: a call, a decision, an agreement. The note is dated
 * now unless the user says it happened earlier.
 */
export function JournalComposer({
  projectId,
  projects = [],
  defaultProjectId = '',
  autoFocus = false,
  onSaved,
  onCancel,
}: JournalComposerProps) {
  const id = useId()
  const createEntry = useCreateJournalEntry()
  const [text, setText] = useState('')
  const [pickedProject, setPickedProject] = useState(defaultProjectId)
  const [when, setWhen] = useState<When>('now')
  const [moment, setMoment] = useState('')

  function pickWhen(value: When) {
    setWhen(value)
    if (value === 'yesterday') setMoment(toLocalInputValue(new Date(Date.now() - dayMs)))
    if (value === 'custom') setMoment(toLocalInputValue(new Date()))
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const happenedAt = when === 'now' ? undefined : fromLocalInputValue(moment)
    if (happenedAt === null) {
      toast.error('Укажите дату и время')
      return
    }
    if (happenedAt !== undefined && new Date(happenedAt).getTime() > Date.now()) {
      toast.error('Запись не может быть датирована будущим')
      return
    }
    const result = journalEntryCreateSchema.safeParse({ projectId: projectId ?? pickedProject, text, happenedAt })
    if (!result.success) {
      toast.error(result.error.issues[0]?.path[0] === 'projectId' ? 'Выберите проект' : 'Напишите, что произошло')
      return
    }
    createEntry.mutate(result.data, {
      onSuccess: (response) => {
        setText('')
        setWhen('now')
        onSaved?.(response)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
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
        <Field className="w-auto" aria-labelledby={`${id}-when`}>
          <FieldTitle id={`${id}-when`}>Когда</FieldTitle>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedChoice aria-labelledby={`${id}-when`} options={whenOptions} value={when} onChange={pickWhen} />
            {when !== 'now' && (
              <Input
                type="datetime-local"
                aria-label="Дата и время"
                value={moment}
                max={toLocalInputValue(new Date())}
                className="w-auto"
                onChange={(event) => setMoment(event.target.value)}
              />
            )}
          </div>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`${id}-text`}>Что произошло</FieldLabel>
        <Textarea
          id={`${id}-text`}
          value={text}
          autoFocus={autoFocus}
          placeholder="Созвонились с клиентом: согласовали запуск, ждут счёт до пятницы"
          className="min-h-28 max-h-80"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={submitOnShortcut}
        />
      </Field>
      <div className="flex items-center gap-2">
        <ShortcutHint keys="mod-enter" action="записать" />
        <div className="ml-auto flex gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Отмена
            </Button>
          )}
          <Button type="submit" disabled={createEntry.isPending}>
            Записать
          </Button>
        </div>
      </div>
    </form>
  )
}

function EntryEditor({ entry, onDone }: { entry: JournalEntryDto; onDone: () => void }) {
  const id = useId()
  const updateEntry = useUpdateJournalEntry()
  const [text, setText] = useState(entry.text)
  const initialMoment = toLocalInputValue(new Date(entry.happenedAt))
  const [moment, setMoment] = useState(initialMoment)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    // Only a changed moment is sent, so saving a reworded note keeps its seconds untouched.
    const happenedAt = moment === initialMoment ? undefined : fromLocalInputValue(moment)
    if (happenedAt === null) {
      toast.error('Укажите дату и время')
      return
    }
    const result = journalEntryUpdateSchema.safeParse({ text, happenedAt })
    if (!result.success) {
      toast.error('Запись не может быть пустой')
      return
    }
    updateEntry.mutate(
      { id: entry.id, payload: result.data },
      { onSuccess: onDone, onError: (error) => toast.error(error.message) },
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDone()
      }}
    >
      <Textarea
        value={text}
        autoFocus
        aria-label="Текст записи"
        className="max-h-80"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={submitOnShortcut}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`${id}-moment`}
          type="datetime-local"
          aria-label="Когда"
          value={moment}
          max={toLocalInputValue(new Date())}
          className="h-8 w-auto"
          onChange={(event) => setMoment(event.target.value)}
        />
        <ShortcutHint keys="mod-enter" action="сохранить" />
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Отмена
          </Button>
          <Button type="submit" size="sm" disabled={updateEntry.isPending}>
            Сохранить
          </Button>
        </div>
      </div>
    </form>
  )
}

type JournalTimelineProps = {
  entries: JournalEntryDto[]
  /** Show which project an entry belongs to on the cross-project feed. */
  showProject?: boolean
  /** Entries shown before "show more". */
  pageSize?: number
  emptyText?: string
}

/**
 * History as a vertical timeline. A filled dot is a note written by a person, a hollow one is an
 * event the panel recorded itself (status change, outage, finished task).
 */
export function JournalTimeline({
  entries,
  showProject = false,
  pageSize = 8,
  emptyText = 'Записей пока нет',
}: JournalTimelineProps) {
  const deleteEntry = useDeleteJournalEntry()
  const [visible, setVisible] = useState(pageSize)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<JournalEntryDto | null>(null)

  function handleDelete() {
    if (!deleting) return
    deleteEntry.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: (error) => toast.error(error.message),
    })
  }

  if (entries.length === 0) {
    return (
      <Typography variant="bodySm" tone="muted">
        {emptyText}
      </Typography>
    )
  }

  return (
    <div className="grid gap-3">
      <ol className="ml-1 grid gap-4 border-l pl-4">
        {entries.slice(0, visible).map((entry) => {
          const isNote = entry.kind === 'NOTE'
          return (
            <li key={entry.id} className="group relative grid gap-1">
              <span
                aria-hidden
                className={cn(
                  'absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background ring-1',
                  isNote ? 'bg-primary ring-primary' : 'bg-background ring-muted-foreground/50',
                )}
              />
              <div className="flex flex-wrap items-center gap-x-2">
                <Typography as="span" variant="caption" tone="muted">
                  {formatDateTime(entry.happenedAt)}
                </Typography>
                {showProject && (
                  <Typography asChild variant="caption">
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: entry.project.id }}
                      className="underline-offset-4 hover:underline"
                    >
                      {entry.project.name}
                    </Link>
                  </Typography>
                )}
                {!isNote && (
                  <Typography as="span" variant="caption" tone="muted">
                    авто
                  </Typography>
                )}
                <span className="ml-auto flex gap-0.5 opacity-60 group-hover:opacity-100">
                  {isNote && (
                    <Button type="button" variant="ghost" size="icon-xs" title="Изменить" onClick={() => setEditingId(entry.id)}>
                      <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                      <Typography variant="srOnly">Изменить запись</Typography>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title="Удалить"
                    onClick={() => setDeleting(entry)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    <Typography variant="srOnly">Удалить запись</Typography>
                  </Button>
                </span>
              </div>
              {editingId === entry.id ? (
                <EntryEditor entry={entry} onDone={() => setEditingId(null)} />
              ) : (
                <Typography
                  variant="bodySm"
                  tone={isNote ? 'current' : 'muted'}
                  className={cn('break-words whitespace-pre-wrap', isNote && 'rounded-lg bg-muted/50 px-3 py-2')}
                >
                  {entry.text}
                </Typography>
              )}
            </li>
          )
        })}
      </ol>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Удалить запись из журнала?"
        description={deleting ? deleting.text.slice(0, 200) : ''}
        pending={deleteEntry.isPending}
        onConfirm={handleDelete}
      />
      {entries.length > visible && (
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setVisible(visible + pageSize * 3)}>
          {`Показать ещё (${entries.length - visible})`}
        </Button>
      )}
    </div>
  )
}
