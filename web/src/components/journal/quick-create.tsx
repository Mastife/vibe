import { NoteAddIcon, TaskAdd01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ProjectRef } from '@projects-hq/contracts'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { EntityDialog } from '@/components/entity-dialog'
import { JournalComposer } from '@/components/journal/journal'
import { TaskComposer } from '@/components/journal/tasks'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { useProjects } from '@/lib/queries'
import { useHotkey } from '@/lib/keyboard'
import { cn } from '@/lib/utils'

type Kind = 'task' | 'note'

const kinds: Record<Kind, { label: string; key: string; code: string; icon: typeof NoteAddIcon; title: string; description: string; saved: string }> = {
  task: {
    label: 'Задача',
    key: 'T',
    code: 'KeyT',
    icon: TaskAdd01Icon,
    title: 'Новая задача',
    description: 'Перед сроком бот напомнит в Telegram.',
    saved: 'Задача добавлена',
  },
  note: {
    label: 'Запись',
    key: 'N',
    code: 'KeyN',
    icon: NoteAddIcon,
    title: 'Новая запись в журнал',
    description: 'Созвон, решение, договорённость. Запись попадёт в историю проекта.',
    saved: 'Записано в журнал',
  },
}

function QuickCreateForm({ kind, defaultProjectId, onClose }: { kind: Kind; defaultProjectId?: string; onClose: () => void }) {
  const navigate = useNavigate()
  const projects = useProjects()
  const pickable = (projects.data?.projects ?? []).filter(
    (project) => project.status !== 'ARCHIVED' || project.id === defaultProjectId,
  )

  function handleSaved(project: ProjectRef) {
    onClose()
    toast.success(kinds[kind].saved, {
      description: project.name,
      action: {
        label: 'К проекту',
        onClick: () => void navigate({ to: '/projects/$projectId', params: { projectId: project.id } }),
      },
    })
  }

  // The project list arrives after the first render; remount so the default lands in the select.
  const key = projects.isPending ? 'loading' : 'ready'
  const props = {
    projects: pickable,
    defaultProjectId,
    autoFocus: true,
    onCancel: onClose,
  }
  return kind === 'task' ? (
    <TaskComposer key={key} {...props} onSaved={({ task }) => handleSaved(task.project)} />
  ) : (
    <JournalComposer key={key} {...props} onSaved={({ entry }) => handleSaved(entry.project)} />
  )
}

function QuickCreateButton({ kind, onOpen }: { kind: Kind; onOpen: () => void }) {
  const { label, key, icon, title } = kinds[kind]
  useHotkey(kinds[kind].code, onOpen)
  return (
    <Button type="button" size="sm" variant={kind === 'note' ? 'default' : 'outline'} title={`${title} (${key})`} onClick={onOpen}>
      <HugeiconsIcon icon={icon} strokeWidth={2} data-icon="inline-start" />
      {label}
      <Kbd className={cn('hidden md:inline-flex', kind === 'note' && 'bg-primary-foreground/15 text-primary-foreground')}>{key}</Kbd>
    </Button>
  )
}

/**
 * The header's "Задача" and "Запись" buttons, also on the T and N keys: a task or a journal note
 * from any page. On a project page that project is picked already.
 */
export function QuickCreate() {
  // The kind outlives `open` so the title stays put while the dialog fades out.
  const [kind, setKind] = useState<Kind>('note')
  const [open, setOpen] = useState(false)
  const { projectId } = useParams({ strict: false })

  function openKind(next: Kind) {
    setKind(next)
    setOpen(true)
  }

  return (
    <div className="flex items-center gap-2">
      <QuickCreateButton kind="task" onOpen={() => openKind('task')} />
      <QuickCreateButton kind="note" onOpen={() => openKind('note')} />
      <EntityDialog open={open} onOpenChange={setOpen} title={kinds[kind].title} description={kinds[kind].description}>
        <QuickCreateForm key={kind} kind={kind} defaultProjectId={projectId} onClose={() => setOpen(false)} />
      </EntityDialog>
    </div>
  )
}
