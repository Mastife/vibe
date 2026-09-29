import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import type { AppBindings } from '../http/context'

export function bearerToken(c: Context) {
  const authorization = c.req.header('authorization')
  if (!authorization?.startsWith('Bearer ')) return undefined
  return authorization.slice('Bearer '.length)
}

/** Rejects the request with 401 unless a valid access token with a live session is presented. */
export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const { user } = await c.get('authService').getMe(bearerToken(c))
  c.set('user', user)
  await next()
})
