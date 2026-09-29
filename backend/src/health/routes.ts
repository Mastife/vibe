import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { healthRunAllResponseSchema } from '@projects-hq/contracts'

import { requireAuth } from '../auth/guard'
import type { AppBindings } from '../http/context'
import { validationErrorHook } from '../http/errors'
import { jsonResponse, unauthorizedResponse } from '../http/openapi'

const runAllRoute = createRoute({
  method: 'post',
  path: '/run',
  responses: {
    200: jsonResponse(healthRunAllResponseSchema, 'Checked every monitored project right now'),
    401: unauthorizedResponse,
  },
})

export function createHealthRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook: validationErrorHook })
  routes.use('*', requireAuth)

  routes.openapi(runAllRoute, async (c) => {
    return c.json(await c.get('healthService').checkAll(), 200)
  })

  return routes
}
