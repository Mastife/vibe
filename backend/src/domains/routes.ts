import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import {
  domainCreateSchema,
  domainListResponseSchema,
  domainResponseSchema,
  domainSyncResponseSchema,
  domainUpdateSchema,
  idParamSchema,
} from '@projects-hq/contracts'

import { requireAuth } from '../auth/guard'
import type { AppBindings } from '../http/context'
import { validationErrorHook } from '../http/errors'
import {
  conflictResponse,
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
    200: jsonResponse(domainListResponseSchema, 'All domains ordered by expiry'),
    401: unauthorizedResponse,
  },
})

const createDomainRoute = createRoute({
  method: 'post',
  path: '/',
  request: { body: jsonBody(domainCreateSchema) },
  responses: {
    201: jsonResponse(domainResponseSchema, 'Created domain'),
    400: validationResponse,
    401: unauthorizedResponse,
    409: conflictResponse,
  },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  request: { params: idParamSchema, body: jsonBody(domainUpdateSchema) },
  responses: {
    200: jsonResponse(domainResponseSchema, 'Updated domain'),
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    409: conflictResponse,
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Domain deleted' },
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

const syncRoute = createRoute({
  method: 'post',
  path: '/sync',
  responses: {
    200: jsonResponse(domainSyncResponseSchema, 'Expiry dates refreshed from RDAP where the TLD supports it'),
    401: unauthorizedResponse,
  },
})

export function createDomainRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook: validationErrorHook })
  routes.use('*', requireAuth)

  routes.openapi(listRoute, async (c) => {
    return c.json({ domains: await c.get('domainsService').list() }, 200)
  })

  routes.openapi(createDomainRoute, async (c) => {
    return c.json({ domain: await c.get('domainsService').create(c.req.valid('json')) }, 201)
  })

  routes.openapi(syncRoute, async (c) => {
    return c.json(await c.get('domainsService').syncExpiry(), 200)
  })

  routes.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param')
    return c.json({ domain: await c.get('domainsService').update(id, c.req.valid('json')) }, 200)
  })

  routes.openapi(deleteRoute, async (c) => {
    await c.get('domainsService').remove(c.req.valid('param').id)
    return c.body(null, 204)
  })

  return routes
}
