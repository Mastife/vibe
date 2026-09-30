import { Delete02Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { journalEntryCreateSchema, journalEntryUpdateSchema, type JournalEntryDto, type ProjectDto } from '@projects-hq/contracts'
import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Typography } from '@/components/ui/typography'
import { formatDateTime } from '@/lib/format'
import { useCreateJournalEntry, useDeleteJournalEntry, useUpdateJournalEntry } from '@/lib/queries'
import { cn } from '@/lib/utils'

type JournalComposerProps = {
  /** Fixed project on a project page; omit to let the user pick one. */
  projectId?: string
  projects?: ProjectDto[]
}

/** Writes a note into the project's history: a call, a decision, an agreement. */
export function JournalComposer({ projectId, projects = [] }: JournalComposerProps) {
  const id = useId()
  const createEntry = useCreateJournalEntry()
  const [text, setText] = useState('')
  const [pickedProject, setPickedProject] = useState('')

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const result = journalEntryCreateSchema.safeParse({ projectId: projectId ?? pickedProject, text })
    if (!result.success) {
      toast.error(result.error.issues[0]?.path[0] === 'projectId' ? 'Выберите проект' : 'Напишите, что произошло')
      return
    }
    createEntry.mutate(result.data, {
      onSuccess: () => setText(''),
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2">
      <Textarea
        value={text}
        rows={2}
        placeholder="Что произошло: созвон, решение, договорённость"
        aria-label="Новая запись"
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex flex-wrap justify-end gap-2">
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
        <Button type="submit" disabled={createEntry.isPending}>
          Записать
        </Button>
      </div>
    </form>
  )
}

function EntryEditor({ entry, onDone }: { entry: JournalEntryDto; onDone: () => void }) {
  const updateEntry = useUpdateJournalEntry()
  const [text, setText] = useState(entry.text)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const result = journalEntryUpdateSchema.safeParse({ text })
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
    <form onSubmit={handleSubmit} className="grid gap-2">
      <Textarea value={text} autoFocus aria-label="Текст записи" onChange={(event) => setText(event.target.value)} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Отмена
        </Button>
        <Button type="submit" size="sm" disabled={updateEntry.isPending}>
          Сохранить
        </Button>
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
                    disabled={deleteEntry.isPending}
                    onClick={() => deleteEntry.mutate(entry.id, { onError: (error) => toast.error(error.message) })}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    <Typography variant="srOnly">Удалить запись</Typography>
                  </Button>
                </span>
              </div>
              {editingId === entry.id ? (
                <EntryEditor entry={entry} onDone={() => setEditingId(null)} />
              ) : (
                <Typography variant="bodySm" tone={isNote ? 'current' : 'muted'} className="break-words whitespace-pre-wrap">
                  {entry.text}
                </Typography>
              )}
            </li>
          )
        })}
      </ol>
      {entries.length > visible && (
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setVisible(visible + pageSize * 3)}>
          {`Показать ещё (${entries.length - visible})`}
        </Button>
      )}
    </div>
  )
}
