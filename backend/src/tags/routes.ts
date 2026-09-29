import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import {
  tagListResponseSchema,
  tagMutationResponseSchema,
  tagParamSchema,
  tagRenameSchema,
} from '@projects-hq/contracts'

import { requireAuth } from '../auth/guard'
import type { AppBindings } from '../http/context'
import { validationErrorHook } from '../http/errors'
import { jsonBody, jsonResponse, notFoundResponse, unauthorizedResponse, validationResponse } from '../http/openapi'

const listRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: jsonResponse(tagListResponseSchema, 'Every project tag with its usage count'),
    401: unauthorizedResponse,
  },
})

const renameRoute = createRoute({
  method: 'patch',
  path: '/{name}',
  request: { params: tagParamSchema, body: jsonBody(tagRenameSchema) },
  responses: {
    200: jsonResponse(tagMutationResponseSchema, 'Tag renamed on every project'),
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{name}',
  request: { params: tagParamSchema },
  responses: {
    200: jsonResponse(tagMutationResponseSchema, 'Tag removed from every project'),
    400: validationResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
  },
})

export function createTagRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook: validationErrorHook })
  routes.use('*', requireAuth)

  routes.openapi(listRoute, async (c) => {
    return c.json({ tags: await c.get('tagsService').list() }, 200)
  })

  routes.openapi(renameRoute, async (c) => {
    const { name } = c.req.valid('param')
    return c.json(await c.get('tagsService').rename(name, c.req.valid('json').name), 200)
  })

  routes.openapi(deleteRoute, async (c) => {
    return c.json(await c.get('tagsService').remove(c.req.valid('param').name), 200)
  })

  return routes
}
