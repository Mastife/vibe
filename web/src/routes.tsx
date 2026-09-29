import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import { RootLayout } from '@/components/root-layout'
import { AnalyticsPage } from '@/pages/analytics'
import { ClientsPage } from '@/pages/clients'
import { DashboardPage } from '@/pages/dashboard'
import { DomainsPage } from '@/pages/domains'
import { InvoicesPage } from '@/pages/invoices'
import { ProjectDetailPage } from '@/pages/project-detail'
import { ProjectsPage } from '@/pages/projects'
import { ServerDetailPage } from '@/pages/server-detail'
import { ServersPage } from '@/pages/servers'

const rootRoute = createRootRoute({
  component: RootLayout,
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
})

const analyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analytics',
  component: AnalyticsPage,
})

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  component: ProjectsPage,
})

const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: ProjectDetailPage,
})

const serversRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/servers',
  component: ServersPage,
})

const serverDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/servers/$serverId',
  component: ServerDetailPage,
})

const domainsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/domains',
  component: DomainsPage,
})

const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/clients',
  component: ClientsPage,
})

const invoicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invoices',
  component: InvoicesPage,
})

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  analyticsRoute,
  projectsRoute,
  projectDetailRoute,
  serversRoute,
  serverDetailRoute,
  domainsRoute,
  clientsRoute,
  invoicesRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
