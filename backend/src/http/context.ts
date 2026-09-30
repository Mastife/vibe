import type { UserDto } from '@projects-hq/contracts'

import type { AuthService } from '../auth/service'
import type { ClientsService } from '../clients/service'
import type { AnalyticsService } from '../dashboard/analytics'
import type { DomainsService } from '../domains/service'
import type { TagsService } from '../tags/service'
import type { DashboardService } from '../dashboard/service'
import type { AppEnv } from '../env'
import type { HealthService } from '../health/service'
import type { InvoicesService } from '../invoices/service'
import type { JournalService } from '../journal/service'
import type { ProjectsService } from '../projects/service'
import type { ServersService } from '../servers/service'
import type { StorageService } from '../storage/service'
import type { TasksService } from '../tasks/service'

export type AppVariables = {
  env: AppEnv
  authService: AuthService
  storageService: StorageService | null
  projectsService: ProjectsService
  serversService: ServersService
  clientsService: ClientsService
  invoicesService: InvoicesService
  healthService: HealthService
  dashboardService: DashboardService
  analyticsService: AnalyticsService
  domainsService: DomainsService
  tagsService: TagsService
  journalService: JournalService
  tasksService: TasksService
  /** Set by `requireAuth` for every protected route. */
  user: UserDto
}

export type AppBindings = {
  Variables: AppVariables
}
