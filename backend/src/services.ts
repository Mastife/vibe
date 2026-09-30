import { AuthService } from './auth/service'
import { ClientsService } from './clients/service'
import { AnalyticsService } from './dashboard/analytics'
import { DashboardService } from './dashboard/service'
import type { DbClient } from './db'
import { DomainsService } from './domains/service'
import type { AppEnv } from './env'
import { checkUrl } from './health/checker'
import { checkDockerOverSsh } from './health/docker-checker'
import { HealthService } from './health/service'
import { BillingService } from './invoices/billing'
import { InvoicesService } from './invoices/service'
import { JournalService } from './journal/service'
import type { FetchLike } from './lib/fetch'
import { createBotApi, JournalBot } from './notifications/bot'
import { RemindersService } from './notifications/reminders'
import { createNotifierFromEnv, type Notifier } from './notifications/telegram'
import { ProjectsService } from './projects/service'
import { ServersService } from './servers/service'
import { createStorageServiceFromEnv, type StorageService } from './storage/service'
import { TagsService } from './tags/service'
import { TasksService } from './tasks/service'

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
  domainsService: DomainsService
  tagsService: TagsService
  journalService: JournalService
  tasksService: TasksService
  billingService: BillingService
  remindersService: RemindersService
  notifier: Notifier | null
  /** Telegram chat front end for journal notes; only the worker polls it. */
  journalBot: JournalBot | null
}

type ServiceOptions = {
  /** Outbound fetch used for notifications; tests inject a recorder. */
  fetchImpl?: FetchLike
  /** Health probe implementation; tests inject a deterministic one. */
  check?: typeof checkUrl
  /** Docker-over-SSH probe; tests inject a deterministic one. */
  checkDocker?: typeof checkDockerOverSsh
}

/** One place that wires feature services so the API, worker, and cron share the same graph. */
export function createServices({ env, prisma }: { env: AppEnv; prisma: DbClient }, options: ServiceOptions = {}): Services {
  const authService = new AuthService(prisma, env)
  const storageService = createStorageServiceFromEnv(env)
  const notifier = createNotifierFromEnv(env, options.fetchImpl ?? fetch)
  const journalService = new JournalService(prisma)
  const tasksService = new TasksService(prisma, journalService)
  const projectsService = new ProjectsService(prisma, journalService)
  const serversService = new ServersService(prisma)
  const clientsService = new ClientsService(prisma)
  const invoicesService = new InvoicesService(prisma)
  const healthService = new HealthService(
    prisma,
    env,
    notifier,
    options.check ?? checkUrl,
    options.checkDocker ?? checkDockerOverSsh,
    journalService,
  )
  const domainsService = new DomainsService(prisma, options.fetchImpl ?? fetch)
  const dashboardService = new DashboardService(prisma, projectsService, serversService, invoicesService, domainsService)
  const analyticsService = new AnalyticsService(prisma, projectsService, serversService, invoicesService)
  const tagsService = new TagsService(prisma)
  const billingService = new BillingService(prisma, env, notifier)
  const remindersService = new RemindersService(
    prisma,
    projectsService,
    serversService,
    domainsService,
    invoicesService,
    tasksService,
    notifier,
    env.APP_URL,
  )
  const journalBot =
    env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID
      ? new JournalBot({
          api: createBotApi(env.TELEGRAM_BOT_TOKEN, options.fetchImpl ?? fetch),
          chatId: env.TELEGRAM_CHAT_ID,
          projects: projectsService,
          journal: journalService,
          appUrl: env.APP_URL ?? undefined,
        })
      : null

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
    domainsService,
    tagsService,
    journalService,
    tasksService,
    billingService,
    remindersService,
    notifier,
    journalBot,
  }
}
