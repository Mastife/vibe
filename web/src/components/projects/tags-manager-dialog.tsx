import { Delete02Icon, Edit02Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { TagDto } from '@projects-hq/contracts'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { EntityDialog } from '@/components/entity-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Typography } from '@/components/ui/typography'
import { plural } from '@/lib/format'
import { useDeleteTag, useRenameTag, useTags } from '@/lib/queries'

type TagsManagerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Keeps an open project form in sync when a tag it holds is renamed or deleted. */
  onRenamed?: (from: string, to: string) => void
  onDeleted?: (name: string) => void
}

/** Rename or delete a tag across every project at once. */
export function TagsManagerDialog({ open, onOpenChange, onRenamed, onDeleted }: TagsManagerDialogProps) {
  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Теги"
      description="Переименование и удаление применяются сразу ко всем проектам."
    >
      <TagsManager onRenamed={onRenamed} onDeleted={onDeleted} />
    </EntityDialog>
  )
}

function TagsManager({ onRenamed, onDeleted }: Pick<TagsManagerDialogProps, 'onRenamed' | 'onDeleted'>) {
  const tags = useTags()
  const renameTag = useRenameTag()
  const deleteTag = useDeleteTag()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [deleting, setDeleting] = useState<TagDto | null>(null)

  function startEdit(tag: TagDto) {
    setEditing(tag.name)
    setDraft(tag.name)
  }

  function saveEdit() {
    if (!editing) return
    const next = draft.trim()
    if (!next || next === editing) {
      setEditing(null)
      return
    }
    const from = editing
    renameTag.mutate(
      { name: from, newName: next },
      {
        onSuccess: (result) => {
          toast.success(`Тег переименован в ${result.updated} ${plural(result.updated, ['проекте', 'проектах', 'проектах'])}`)
          onRenamed?.(from, next)
          setEditing(null)
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  function confirmDelete() {
    if (!deleting) return
    const name = deleting.name
    deleteTag.mutate(name, {
      onSuccess: (result) => {
        toast.success(`Тег удалён из ${result.updated} ${plural(result.updated, ['проекта', 'проектов', 'проектов'])}`)
        onDeleted?.(name)
        setDeleting(null)
      },
      onError: (error) => toast.error(error.message),
    })
  }

  if (tags.isPending) return <Skeleton className="h-40" />
  const rows = tags.data?.tags ?? []
  if (rows.length === 0) {
    return <EmptyState title="Тегов пока нет" description="Добавьте тег в форме проекта — он появится здесь." />
  }

  return (
    <>
      <div className="grid gap-1">
        {rows.map((tag) => (
          <div key={tag.name} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
            {editing === tag.name ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  saveEdit()
                }}
              >
                <Input
                  value={draft}
                  autoFocus
                  maxLength={32}
                  aria-label={`Новое название тега ${tag.name}`}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation()
                      setEditing(null)
                    }
                  }}
                />
                <Button type="submit" size="icon-sm" disabled={renameTag.isPending} title="Сохранить">
                  <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
                  <Typography variant="srOnly">Сохранить</Typography>
                </Button>
              </form>
            ) : (
              <>
                <Typography as="span" variant="bodySm" truncate className="min-w-0 flex-1">
                  {tag.name}
                </Typography>
                <Typography as="span" variant="caption" tone="muted" className="shrink-0">
                  {tag.count} {plural(tag.count, ['проект', 'проекта', 'проектов'])}
                </Typography>
                <Button type="button" variant="ghost" size="icon-sm" title="Переименовать" onClick={() => startEdit(tag)}>
                  <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                  <Typography variant="srOnly">Переименовать</Typography>
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" title="Удалить" onClick={() => setDeleting(tag)}>
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  <Typography variant="srOnly">Удалить</Typography>
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Удалить тег «${deleting?.name ?? ''}»?`}
        description={`Тег пропадёт из ${deleting?.count ?? 0} ${plural(deleting?.count ?? 0, ['проекта', 'проектов', 'проектов'])}. Сами проекты не изменятся.`}
        pending={deleteTag.isPending}
        onConfirm={confirmDelete}
      />
    </>
  )
}
