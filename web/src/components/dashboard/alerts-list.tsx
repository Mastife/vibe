import type { AlertDto } from '@projects-hq/contracts'
import { Link } from '@tanstack/react-router'

import { EmptyState } from '@/components/empty-state'
import { SeverityDot } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Typography } from '@/components/ui/typography'
import { severityLabels } from '@/lib/labels'

function AlertLink({ alert }: { alert: AlertDto }) {
  const label = 'Открыть'

  if (alert.entityType === 'project' && alert.entityId) {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link to="/projects/$projectId" params={{ projectId: alert.entityId }}>
          {label}
        </Link>
      </Button>
    )
  }
  if (alert.entityType === 'server' && alert.entityId) {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link to="/servers/$serverId" params={{ serverId: alert.entityId }}>
          {label}
        </Link>
      </Button>
    )
  }
  if (alert.entityType === 'domain') {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link to="/domains">{label}</Link>
      </Button>
    )
  }
  if (alert.entityType === 'invoice') {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link to="/invoices">{label}</Link>
      </Button>
    )
  }
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to="/projects">{label}</Link>
    </Button>
  )
}

export function AlertsList({ alerts }: { alerts: AlertDto[] }) {
  if (alerts.length === 0) {
    return (
      <EmptyState
        title="Всё спокойно"
        description="Нет недоступных проектов, просроченных оплат и истекающих сертификатов."
      />
    )
  }

  return (
    <ItemGroup className="gap-2">
      {alerts.map((alert) => (
        <Item key={alert.id} variant="outline" size="sm">
          <ItemMedia>
            <SeverityDot severity={alert.severity} className="size-2.5" />
            <Typography variant="srOnly">{severityLabels[alert.severity]}</Typography>
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="line-clamp-none">{alert.title}</ItemTitle>
            <ItemDescription className="line-clamp-none">{alert.description}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <AlertLink alert={alert} />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  )
}
