import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import {
  clientCreateSchema,
  clientListResponseSchema,
  clientResponseSchema,
  clientUpdateSchema,
  idParamSchema,
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
    200: jsonResponse(clientListResponseSchema, 'All clients with outstanding balances'),
    401: unauthorizedResponse,
  },
})

const createClientRoute = createRoute({
  method: 'post',
  path: '/',
  request: { body: jsonBody(clientCreateSchema) },
  responses: {
    201: jsonResponse(clientResponseSchema, 'Created client'),
    400: validationResponse,
    401: unauthorizedResponse,
  },
})

const detailRoute = createRoute({
  method: 'get',
  path: '/{id}',
  request: { params: idParamSchema },
  responses: {
    200: jsonResponse(clientResponseSchema, 'Client'),
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  request: { params: idParamSchema, body: jsonBody(clientUpdateSchema) },
  responses: {
    200: jsonResponse(clientResponseSchema, 'Updated client'),
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
    204: { description: 'Client deleted' },
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    409: errorResponse('Client still has invoices'),
  },
})

export function createClientRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook: validationErrorHook })
  routes.use('*', requireAuth)

  routes.openapi(listRoute, async (c) => {
    return c.json({ clients: await c.get('clientsService').list() }, 200)
  })

  routes.openapi(createClientRoute, async (c) => {
    return c.json({ client: await c.get('clientsService').create(c.req.valid('json')) }, 201)
  })

  routes.openapi(detailRoute, async (c) => {
    return c.json({ client: await c.get('clientsService').get(c.req.valid('param').id) }, 200)
  })

  routes.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param')
    return c.json({ client: await c.get('clientsService').update(id, c.req.valid('json')) }, 200)
  })

  routes.openapi(deleteRoute, async (c) => {
    await c.get('clientsService').remove(c.req.valid('param').id)
    return c.body(null, 204)
  })

  return routes
}
