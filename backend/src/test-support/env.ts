import { loadEnv } from '../env'

/** Builds a fully defaulted AppEnv for tests; override only what a test cares about. */
export function testEnv(overrides: Record<string, string | undefined> = {}) {
  return loadEnv({
    DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/projects_hq_test?schema=public',
    JWT_SECRET: 'test-secret-at-least-thirty-two-characters-long',
    CORS_ORIGINS: 'http://localhost:5173',
    ACCESS_TOKEN_TTL_SECONDS: '60',
    ...overrides,
  })
}
