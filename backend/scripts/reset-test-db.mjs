import pg from 'pg'
import { assertTestDatabaseUrl, defaultTestDatabaseUrl } from '../../scripts/repo-env.mjs'

// Empties every application table in the *_test database so E2E runs always start from a fresh panel.
// Migrations are left untouched; run `prisma:deploy` first so the tables exist.
const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl()
assertTestDatabaseUrl(databaseUrl)

const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()

try {
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`,
  )
  const tables = rows.map((row) => `"${row.table_name}"`)

  if (tables.length > 0) {
    await client.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`)
  }

  console.log(`Test database reset: ${tables.length} tables truncated.`)
} finally {
  await client.end()
}
