import { AuthService } from './auth/service'
import { ClientsService } from './clients/service'
import { AnalyticsService } from './dashboard/analytics'
import { DashboardService } from './dashboard/service'
import type { DbClient } from './db'
import type { AppEnv } from './env'
import { checkUrl } from './health/checker'
import { HealthService } from './health/service'
import { InvoicesService } from './invoices/service'
import type { FetchLike } from './lib/fetch'
import { createNotifierFromEnv, type Notifier } from './notifications/telegram'
import { ProjectsService } from './projects/service'
import { ServersService } from './servers/service'
import { createStorageServiceFromEnv, type StorageService } from './storage/service'

export type Services = {
  authService: AuthService
  storageService: StorageService | null
  projectsService: ProjectsService
  serversService: ServersService
  clientsService: ClientsService
  invoicesService: InvoicesService
  healthService: HealthService
  dashboardService: DashboardService
  analyticsService: AnalyticsService
  notifier: Notifier | null
}

type ServiceOptions = {
  /** Outbound fetch used for notifications; tests inject a recorder. */
  fetchImpl?: FetchLike
  /** Health probe implementation; tests inject a deterministic one. */
  check?: typeof checkUrl
}

/** One place that wires feature services so the API, worker, and cron share the same graph. */
export function createServices({ env, prisma }: { env: AppEnv; prisma: DbClient }, options: ServiceOptions = {}): Services {
  const authService = new AuthService(prisma, env)
  const storageService = createStorageServiceFromEnv(env)
  const notifier = createNotifierFromEnv(env, options.fetchImpl ?? fetch)
  const projectsService = new ProjectsService(prisma)
  const serversService = new ServersService(prisma)
  const clientsService = new ClientsService(prisma)
  const invoicesService = new InvoicesService(prisma)
  const healthService = new HealthService(prisma, env, notifier, options.check ?? checkUrl)
  const dashboardService = new DashboardService(prisma, projectsService, serversService, invoicesService)
  const analyticsService = new AnalyticsService(prisma, projectsService, serversService, invoicesService)

  return {
    authService,
    storageService,
    projectsService,
    serversService,
    clientsService,
    invoicesService,
    healthService,
    dashboardService,
    analyticsService,
    notifier,
  }
}
