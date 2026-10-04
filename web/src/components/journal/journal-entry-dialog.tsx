import { NoteAddIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { JournalEntryResponse } from '@projects-hq/contracts'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { EntityDialog } from '@/components/entity-dialog'
import { JournalComposer } from '@/components/journal/journal'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { useProjects } from '@/lib/queries'

/** Typing in a field must never open the dialog, nor may a key pressed inside another dialog. */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.closest('[role="dialog"]') !== null
}

function DialogComposer({ defaultProjectId, onClose }: { defaultProjectId?: string; onClose: () => void }) {
  const navigate = useNavigate()
  const projects = useProjects()
  const pickable = (projects.data?.projects ?? []).filter(
    (project) => project.status !== 'ARCHIVED' || project.id === defaultProjectId,
  )

  function handleSaved({ entry }: JournalEntryResponse) {
    onClose()
    toast.success('Записано в журнал', {
      description: entry.project.name,
      action: {
        label: 'К проекту',
        onClick: () => void navigate({ to: '/projects/$projectId', params: { projectId: entry.project.id } }),
      },
    })
  }

  return (
    <JournalComposer
      // The project list arrives after the first render; remount so the default lands in the select.
      key={projects.isPending ? 'loading' : 'ready'}
      projects={pickable}
      defaultProjectId={defaultProjectId}
      autoFocus
      onSaved={handleSaved}
      onCancel={onClose}
    />
  )
}

/**
 * The header's "Запись" button: a journal note from any page, also on the N key. On a project page
 * that project is picked already.
 */
export function JournalEntryButton() {
  const [open, setOpen] = useState(false)
  const { projectId } = useParams({ strict: false })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // `code` keeps the shortcut on the same key in the Russian layout.
      if (event.code !== 'KeyN' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return
      if (event.defaultPrevented || isTypingTarget(event.target)) return
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <Button type="button" size="sm" title="Новая запись в журнал (N)" onClick={() => setOpen(true)}>
        <HugeiconsIcon icon={NoteAddIcon} strokeWidth={2} data-icon="inline-start" />
        Запись
        <Kbd className="hidden bg-primary-foreground/15 text-primary-foreground md:inline-flex">N</Kbd>
      </Button>
      <EntityDialog
        open={open}
        onOpenChange={setOpen}
        title="Новая запись в журнал"
        description="Созвон, решение, договорённость. Запись попадёт в историю проекта."
      >
        <DialogComposer defaultProjectId={projectId} onClose={() => setOpen(false)} />
      </EntityDialog>
    </>
  )
}
