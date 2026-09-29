import { Delete02Icon, Edit02Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ProjectDto } from '@projects-hq/contracts'
import { Link } from '@tanstack/react-router'

import { HealthBadge, PilotBadge, ProjectStatusBadge } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Typography } from '@/components/ui/typography'
import { formatPercent, formatRelative, hostnameOf } from '@/lib/format'

type ProjectsTableProps = {
  projects: ProjectDto[]
  checkingId: string | null
  onCheck: (project: ProjectDto) => void
  onEdit: (project: ProjectDto) => void
  onDelete: (project: ProjectDto) => void
}

export function ProjectsTable({ projects, checkingId, onCheck, onEdit, onDelete }: ProjectsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Проект</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead>Доступность</TableHead>
          <TableHead>Аптайм 24 ч</TableHead>
          <TableHead>Клиент</TableHead>
          <TableHead>Сервер</TableHead>
          <TableHead>Проверено</TableHead>
          <TableHead className="text-right">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => {
          const target = project.monitorTarget
          return (
            <TableRow key={project.id}>
              <TableCell>
                <div className="grid gap-0.5">
                  <Typography asChild variant="bodySmMedium">
                    <Link to="/projects/$projectId" params={{ projectId: project.id }} className="hover:underline">
                      {project.name}
                    </Link>
                  </Typography>
                  <Typography variant="caption" tone="muted">
                    {!target ? 'без мониторинга' : target.startsWith('http') ? hostnameOf(target) : target}
                  </Typography>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <ProjectStatusBadge status={project.status} />
                  <PilotBadge pilot={project.pilot} />
                </div>
              </TableCell>
              <TableCell>
                <HealthBadge status={project.health.status} />
              </TableCell>
              <TableCell>{formatPercent(project.health.uptime24h)}</TableCell>
              <TableCell>{project.client?.name ?? '—'}</TableCell>
              <TableCell>{project.server?.name ?? '—'}</TableCell>
              <TableCell>{formatRelative(project.health.checkedAt)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title="Проверить сейчас"
                    disabled={!target || checkingId === project.id}
                    onClick={() => onCheck(project)}
                  >
                    <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} />
                    <Typography variant="srOnly">Проверить сейчас</Typography>
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" title="Изменить" onClick={() => onEdit(project)}>
                    <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                    <Typography variant="srOnly">Изменить</Typography>
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" title="Удалить" onClick={() => onDelete(project)}>
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    <Typography variant="srOnly">Удалить</Typography>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
