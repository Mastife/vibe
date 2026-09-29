import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import {
  idParamSchema,
  idSchema,
  serverCreateSchema,
  serverDetailResponseSchema,
  serverListResponseSchema,
  serverPaymentCreateSchema,
  serverResponseSchema,
  serverUpdateSchema,
} from '@projects-hq/contracts'
import { z } from 'zod'

import { requireAuth } from '../auth/guard'
import type { AppBindings } from '../http/context'
import { validationErrorHook } from '../http/errors'
import { jsonBody, jsonResponse, notFoundResponse, unauthorizedResponse, validationResponse } from '../http/openapi'

const paymentParamSchema = z.object({ id: idSchema, paymentId: idSchema })

const listRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: jsonResponse(serverListResponseSchema, 'All servers ordered by the next payment'),
    401: unauthorizedResponse,
  },
})

const createServerRoute = createRoute({
  method: 'post',
  path: '/',
  request: { body: jsonBody(serverCreateSchema) },
  responses: {
    201: jsonResponse(serverResponseSchema, 'Created server'),
    400: validationResponse,
    401: unauthorizedResponse,
  },
})

const detailRoute = createRoute({
  method: 'get',
  path: '/{id}',
  request: { params: idParamSchema },
  responses: {
    200: jsonResponse(serverDetailResponseSchema, 'Server with payment history'),
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  request: { params: idParamSchema, body: jsonBody(serverUpdateSchema) },
  responses: {
    200: jsonResponse(serverResponseSchema, 'Updated server'),
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
    204: { description: 'Server deleted' },
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

const recordPaymentRoute = createRoute({
  method: 'post',
  path: '/{id}/payments',
  request: { params: idParamSchema, body: jsonBody(serverPaymentCreateSchema) },
  responses: {
    201: jsonResponse(serverDetailResponseSchema, 'Payment logged and paid period extended'),
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

const removePaymentRoute = createRoute({
  method: 'delete',
  path: '/{id}/payments/{paymentId}',
  request: { params: paymentParamSchema },
  responses: {
    200: jsonResponse(serverDetailResponseSchema, 'Payment removed and paid period recomputed'),
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

export function createServerRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook: validationErrorHook })
  routes.use('*', requireAuth)

  routes.openapi(listRoute, async (c) => {
    return c.json({ servers: await c.get('serversService').list() }, 200)
  })

  routes.openapi(createServerRoute, async (c) => {
    return c.json({ server: await c.get('serversService').create(c.req.valid('json')) }, 201)
  })

  routes.openapi(detailRoute, async (c) => {
    return c.json(await c.get('serversService').getDetail(c.req.valid('param').id), 200)
  })

  routes.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param')
    return c.json({ server: await c.get('serversService').update(id, c.req.valid('json')) }, 200)
  })

  routes.openapi(deleteRoute, async (c) => {
    await c.get('serversService').remove(c.req.valid('param').id)
    return c.body(null, 204)
  })

  routes.openapi(recordPaymentRoute, async (c) => {
    const { id } = c.req.valid('param')
    return c.json(await c.get('serversService').recordPayment(id, c.req.valid('json')), 201)
  })

  routes.openapi(removePaymentRoute, async (c) => {
    const { id, paymentId } = c.req.valid('param')
    return c.json(await c.get('serversService').removePayment(id, paymentId), 200)
  })

  return routes
}
