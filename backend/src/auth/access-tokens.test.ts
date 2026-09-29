import { describe, expect, test } from 'bun:test'

import { testEnv } from '../test-support/env'
import { signAccessToken, verifyAccessToken } from './access-tokens'

const env = testEnv({ JWT_SECRET: '12345678901234567890123456789012' })

describe('access tokens', () => {
  test('signs and verifies session-scoped JWT payloads', async () => {
    const token = await signAccessToken(
      {
        sub: 'user_1',
        sessionId: 'session_1',
        email: 'user@example.com',
      },
      env,
    )

    await expect(verifyAccessToken(token, env)).resolves.toEqual({
      sub: 'user_1',
      sessionId: 'session_1',
      email: 'user@example.com',
    })
  })
})
