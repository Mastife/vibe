import type { ProjectDto } from '@projects-hq/contracts'
import { Link } from '@tanstack/react-router'

import { EmptyState } from '@/components/empty-state'
import { HealthBadge } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Typography } from '@/components/ui/typography'
import { formatLatency, formatPercent, formatRelative, hostnameOf } from '@/lib/format'

export function MonitoredProjectsTable({ projects }: { projects: ProjectDto[] }) {
  if (projects.length === 0) {
    return (
      <EmptyState
        title="Пока нечего проверять"
        description="Добавьте адрес продакшена проекту, и здесь появится его доступность."
      >
        <Button asChild variant="outline">
          <Link to="/projects">Открыть проекты</Link>
        </Button>
      </EmptyState>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Проект</TableHead>
          <TableHead>Состояние</TableHead>
          <TableHead>Ответ</TableHead>
          <TableHead>Аптайм 24 ч</TableHead>
          <TableHead>Проверено</TableHead>
          <TableHead>Сервер</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell>
              <div className="grid gap-0.5">
                <Typography asChild variant="bodySmMedium">
                  <Link to="/projects/$projectId" params={{ projectId: project.id }} className="hover:underline">
                    {project.name}
                  </Link>
                </Typography>
                <Typography variant="caption" tone="muted">
                  {hostnameOf(project.healthCheckUrl ?? project.productionUrl)}
                </Typography>
              </div>
            </TableCell>
            <TableCell>
              <HealthBadge status={project.health.status} />
            </TableCell>
            <TableCell>{formatLatency(project.health.latencyMs)}</TableCell>
            <TableCell>{formatPercent(project.health.uptime24h)}</TableCell>
            <TableCell>{formatRelative(project.health.checkedAt)}</TableCell>
            <TableCell>{project.server?.name ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
