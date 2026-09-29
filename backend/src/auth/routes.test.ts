import { describe, expect, test } from 'bun:test'

import { createApp } from '../app'
import type { DbClient } from '../db'
import { testEnv } from '../test-support/env'

const env = testEnv({ CORS_ORIGINS: 'https://web.example.com', COOKIE_SECURE: 'true' })

describe('auth routes', () => {
  test('rejects secure cookie refresh and logout requests from untrusted origins before auth service work', async () => {
    const app = createApp({ env, prisma: {} as DbClient })
    const refreshCookie = `projects_hq_refresh=${'r'.repeat(32)}`

    const noOriginRefresh = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: refreshCookie,
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({}),
    })
    const noOriginRefreshBody = await noOriginRefresh.json()

    expect(noOriginRefresh.status).toBe(403)
    expect(noOriginRefreshBody.error.code).toBe('FORBIDDEN')

    const untrustedLogout = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: refreshCookie,
        Origin: 'https://attacker.example',
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({}),
    })
    const untrustedLogoutBody = await untrustedLogout.json()

    expect(untrustedLogout.status).toBe(403)
    expect(untrustedLogoutBody.error.code).toBe('FORBIDDEN')
  })
})
