import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

import { createAuthRoutes } from './auth/routes'
import { createClientRoutes } from './clients/routes'
import { createDashboardRoutes } from './dashboard/routes'
import type { DbClient } from './db'
import type { AppEnv } from './env'
import { createHealthRoutes } from './health/routes'
import type { AppBindings } from './http/context'
import { errorResponse, handleError, validationErrorHook } from './http/errors'
import { createInvoiceRoutes } from './invoices/routes'
import { createProjectRoutes } from './projects/routes'
import { createServerRoutes } from './servers/routes'
import { createServices, type Services } from './services'

type CreateAppOptions = {
  env: AppEnv
  prisma: DbClient
  services?: Services
}

export function createApp({ env, prisma, services = createServices({ env, prisma }) }: CreateAppOptions) {
  const app = new OpenAPIHono<AppBindings>({
    defaultHook: validationErrorHook,
  })

  app.use(secureHeaders())
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return env.CORS_ORIGINS[0] ?? null
        return env.CORS_ORIGINS.includes(origin) ? origin : null
      },
      allowHeaders: ['Content-Type', 'Authorization', 'X-Client-Platform'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
      maxAge: 600,
    }),
  )
  app.use('*', async (c, next) => {
    c.set('env', env)
    c.set('authService', services.authService)
    c.set('storageService', services.storageService)
    c.set('projectsService', services.projectsService)
    c.set('serversService', services.serversService)
    c.set('clientsService', services.clientsService)
    c.set('invoicesService', services.invoicesService)
    c.set('healthService', services.healthService)
    c.set('dashboardService', services.dashboardService)
    await next()
  })

  app.get('/', (c) => {
    return c.json({
      name: 'Projects HQ backend',
      status: 'ok',
    })
  })

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
    })
  })

  app.route('/api/auth', createAuthRoutes())
  app.route('/api/projects', createProjectRoutes())
  app.route('/api/servers', createServerRoutes())
  app.route('/api/clients', createClientRoutes())
  app.route('/api/invoices', createInvoiceRoutes())
  app.route('/api/dashboard', createDashboardRoutes())
  app.route('/api/health', createHealthRoutes())

  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      title: 'Projects HQ API',
      version: '1.0.0',
    },
  })

  app.notFound((c) => c.json(errorResponse('NOT_FOUND', 'Route not found'), 404))
  app.onError(handleError)

  return app
}

export type AppType = ReturnType<typeof createApp>
