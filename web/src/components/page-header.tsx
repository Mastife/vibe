import type { PropsWithChildren } from 'react'

import { Typography } from '@/components/ui/typography'

type PageHeaderProps = PropsWithChildren<{
  title: string
  description?: string
}>

/** Page title row; children render as the action cluster on the right. */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="grid gap-1">
        <Typography variant="h3">{title}</Typography>
        {description && (
          <Typography variant="bodySm" tone="muted">
            {description}
          </Typography>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
