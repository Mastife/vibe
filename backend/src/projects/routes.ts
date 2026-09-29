import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import {
  healthCheckResponseSchema,
  idParamSchema,
  projectCreateSchema,
  projectDetailResponseSchema,
  projectListResponseSchema,
  projectResponseSchema,
  projectUpdateSchema,
} from '@projects-hq/contracts'

import { requireAuth } from '../auth/guard'
import type { AppBindings } from '../http/context'
import { validationErrorHook } from '../http/errors'
import {
  errorResponse,
  jsonBody,
  jsonResponse,
  notFoundResponse,
  unauthorizedResponse,
  validationResponse,
} from '../http/openapi'

const listRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: jsonResponse(projectListResponseSchema, 'All projects with their latest health'),
    401: unauthorizedResponse,
  },
})

const createProjectRoute = createRoute({
  method: 'post',
  path: '/',
  request: { body: jsonBody(projectCreateSchema) },
  responses: {
    201: jsonResponse(projectResponseSchema, 'Created project'),
    400: validationResponse,
    401: unauthorizedResponse,
    409: errorResponse('Slug already exists'),
  },
})

const detailRoute = createRoute({
  method: 'get',
  path: '/{id}',
  request: { params: idParamSchema },
  responses: {
    200: jsonResponse(projectDetailResponseSchema, 'Project with health history and invoices'),
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  request: { params: idParamSchema, body: jsonBody(projectUpdateSchema) },
  responses: {
    200: jsonResponse(projectResponseSchema, 'Updated project'),
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    409: errorResponse('Slug already exists'),
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Project deleted' },
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

const checkRoute = createRoute({
  method: 'post',
  path: '/{id}/check',
  request: { params: idParamSchema },
  responses: {
    200: jsonResponse(healthCheckResponseSchema, 'Fresh health check result'),
    400: errorResponse('Project has no URL to check'),
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

export function createProjectRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook: validationErrorHook })
  routes.use('*', requireAuth)

  routes.openapi(listRoute, async (c) => {
    return c.json({ projects: await c.get('projectsService').list() }, 200)
  })

  routes.openapi(createProjectRoute, async (c) => {
    return c.json({ project: await c.get('projectsService').create(c.req.valid('json')) }, 201)
  })

  routes.openapi(detailRoute, async (c) => {
    return c.json(await c.get('projectsService').getDetail(c.req.valid('param').id), 200)
  })

  routes.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param')
    return c.json({ project: await c.get('projectsService').update(id, c.req.valid('json')) }, 200)
  })

  routes.openapi(deleteRoute, async (c) => {
    await c.get('projectsService').remove(c.req.valid('param').id)
    return c.body(null, 204)
  })

  routes.openapi(checkRoute, async (c) => {
    const { id } = c.req.valid('param')
    const run = await c.get('healthService').checkProject(id)
    const project = await c.get('projectsService').get(id)
    return c.json({ project, run }, 200)
  })

  return routes
}
