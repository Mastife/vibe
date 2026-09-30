import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import {
  idParamSchema,
  journalEntryCreateSchema,
  journalEntryResponseSchema,
  journalEntryUpdateSchema,
  journalListQuerySchema,
  journalListResponseSchema,
} from '@projects-hq/contracts'

import { requireAuth } from '../auth/guard'
import type { AppBindings } from '../http/context'
import { validationErrorHook } from '../http/errors'
import { jsonBody, jsonResponse, notFoundResponse, unauthorizedResponse, validationResponse } from '../http/openapi'

const listRoute = createRoute({
  method: 'get',
  path: '/',
  request: { query: journalListQuerySchema },
  responses: {
    200: jsonResponse(journalListResponseSchema, 'Journal entries, newest first'),
    400: validationResponse,
    401: unauthorizedResponse,
  },
})

const createEntryRoute = createRoute({
  method: 'post',
  path: '/',
  request: { body: jsonBody(journalEntryCreateSchema) },
  responses: {
    201: jsonResponse(journalEntryResponseSchema, 'Created note'),
    400: validationResponse,
    401: unauthorizedResponse,
  },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  request: { params: idParamSchema, body: jsonBody(journalEntryUpdateSchema) },
  responses: {
    200: jsonResponse(journalEntryResponseSchema, 'Updated note'),
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
    204: { description: 'Entry deleted' },
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

export function createJournalRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook: validationErrorHook })
  routes.use('*', requireAuth)

  routes.openapi(listRoute, async (c) => {
    return c.json({ entries: await c.get('journalService').list(c.req.valid('query')) }, 200)
  })

  routes.openapi(createEntryRoute, async (c) => {
    return c.json({ entry: await c.get('journalService').create(c.req.valid('json')) }, 201)
  })

  routes.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param')
    return c.json({ entry: await c.get('journalService').update(id, c.req.valid('json')) }, 200)
  })

  routes.openapi(deleteRoute, async (c) => {
    await c.get('journalService').remove(c.req.valid('param').id)
    return c.body(null, 204)
  })

  return routes
}
