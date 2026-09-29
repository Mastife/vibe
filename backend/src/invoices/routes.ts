import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import {
  idParamSchema,
  invoiceCreateSchema,
  invoiceListQuerySchema,
  invoiceListResponseSchema,
  invoiceResponseSchema,
  invoiceUpdateSchema,
} from '@projects-hq/contracts'

import { requireAuth } from '../auth/guard'
import type { AppBindings } from '../http/context'
import { validationErrorHook } from '../http/errors'
import { jsonBody, jsonResponse, notFoundResponse, unauthorizedResponse, validationResponse } from '../http/openapi'

const listRoute = createRoute({
  method: 'get',
  path: '/',
  request: { query: invoiceListQuerySchema },
  responses: {
    200: jsonResponse(invoiceListResponseSchema, 'Invoices matching the filter'),
    400: validationResponse,
    401: unauthorizedResponse,
  },
})

const createInvoiceRoute = createRoute({
  method: 'post',
  path: '/',
  request: { body: jsonBody(invoiceCreateSchema) },
  responses: {
    201: jsonResponse(invoiceResponseSchema, 'Created invoice'),
    400: validationResponse,
    401: unauthorizedResponse,
  },
})

const detailRoute = createRoute({
  method: 'get',
  path: '/{id}',
  request: { params: idParamSchema },
  responses: {
    200: jsonResponse(invoiceResponseSchema, 'Invoice'),
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  request: { params: idParamSchema, body: jsonBody(invoiceUpdateSchema) },
  responses: {
    200: jsonResponse(invoiceResponseSchema, 'Updated invoice'),
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
    204: { description: 'Invoice deleted' },
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

export function createInvoiceRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook: validationErrorHook })
  routes.use('*', requireAuth)

  routes.openapi(listRoute, async (c) => {
    return c.json({ invoices: await c.get('invoicesService').list(c.req.valid('query')) }, 200)
  })

  routes.openapi(createInvoiceRoute, async (c) => {
    return c.json({ invoice: await c.get('invoicesService').create(c.req.valid('json')) }, 201)
  })

  routes.openapi(detailRoute, async (c) => {
    return c.json({ invoice: await c.get('invoicesService').get(c.req.valid('param').id) }, 200)
  })

  routes.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param')
    return c.json({ invoice: await c.get('invoicesService').update(id, c.req.valid('json')) }, 200)
  })

  routes.openapi(deleteRoute, async (c) => {
    await c.get('invoicesService').remove(c.req.valid('param').id)
    return c.body(null, 204)
  })

  return routes
}
