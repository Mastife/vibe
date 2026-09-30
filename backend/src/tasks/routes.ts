import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import {
  idParamSchema,
  taskCreateSchema,
  taskListQuerySchema,
  taskListResponseSchema,
  taskResponseSchema,
  taskUpdateSchema,
} from '@projects-hq/contracts'

import { requireAuth } from '../auth/guard'
import type { AppBindings } from '../http/context'
import { validationErrorHook } from '../http/errors'
import { jsonBody, jsonResponse, notFoundResponse, unauthorizedResponse, validationResponse } from '../http/openapi'

const listRoute = createRoute({
  method: 'get',
  path: '/',
  request: { query: taskListQuerySchema },
  responses: {
    200: jsonResponse(taskListResponseSchema, 'Tasks: open ones by deadline, then finished ones'),
    400: validationResponse,
    401: unauthorizedResponse,
  },
})

const createTaskRoute = createRoute({
  method: 'post',
  path: '/',
  request: { body: jsonBody(taskCreateSchema) },
  responses: {
    201: jsonResponse(taskResponseSchema, 'Created task'),
    400: validationResponse,
    401: unauthorizedResponse,
  },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  request: { params: idParamSchema, body: jsonBody(taskUpdateSchema) },
  responses: {
    200: jsonResponse(taskResponseSchema, 'Updated task'),
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Task deleted' },
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

export function createTaskRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook: validationErrorHook })
  routes.use('*', requireAuth)

  routes.openapi(listRoute, async (c) => {
    return c.json({ tasks: await c.get('tasksService').list(c.req.valid('query')) }, 200)
  })

  routes.openapi(createTaskRoute, async (c) => {
    return c.json({ task: await c.get('tasksService').create(c.req.valid('json')) }, 201)
  })

  routes.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param')
    return c.json({ task: await c.get('tasksService').update(id, c.req.valid('json')) }, 200)
  })

  routes.openapi(deleteRoute, async (c) => {
    await c.get('tasksService').remove(c.req.valid('param').id)
    return c.body(null, 204)
  })

  return routes
}
