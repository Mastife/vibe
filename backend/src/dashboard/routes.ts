import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { analyticsResponseSchema, dashboardResponseSchema } from '@projects-hq/contracts'

import { requireAuth } from '../auth/guard'
import type { AppBindings } from '../http/context'
import { validationErrorHook } from '../http/errors'
import { jsonResponse, unauthorizedResponse } from '../http/openapi'

const dashboardRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: jsonResponse(dashboardResponseSchema, 'Aggregated health, billing, and receivables overview'),
    401: unauthorizedResponse,
  },
})

const analyticsRoute = createRoute({
  method: 'get',
  path: '/analytics',
  responses: {
    200: jsonResponse(analyticsResponseSchema, 'Health and finance time series for the analytics dashboards'),
    401: unauthorizedResponse,
  },
})

export function createDashboardRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook: validationErrorHook })
  routes.use('*', requireAuth)

  routes.openapi(dashboardRoute, async (c) => {
    return c.json(await c.get('dashboardService').build(), 200)
  })

  routes.openapi(analyticsRoute, async (c) => {
    return c.json(await c.get('analyticsService').build(), 200)
  })

  return routes
}
