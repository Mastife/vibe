import type { PropsWithChildren } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type EntityDialogProps = PropsWithChildren<{
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
}>

/** Scrollable modal for create/edit forms; content unmounts on close so forms always start fresh. */
export function EntityDialog({ open, onOpenChange, title, description, children }: EntityDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
