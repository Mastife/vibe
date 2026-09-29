# Backend

The backend owns the Projects HQ API, the monitoring worker, authentication, persistence, and integrations (Telegram, GitHub). The web client relies on the shared data contract in `packages/contracts`.

## Stack

- Bun
- Hono
- Prisma 7
- PostgreSQL
- Zod
- jose JWT
- TypeScript

## Commands

Run these from the repository root:

```bash
docker compose version
docker info
docker compose pull postgres
docker compose up -d postgres
cp backend/.env.example backend/.env
bun run --cwd backend dev
bun run --cwd backend typecheck
bun run --cwd backend test
bun run --cwd backend test:unit
bun run --cwd backend test:integration
bun run --cwd backend dev:worker
bun run --cwd backend seed
bun run --cwd backend start:api
bun run --cwd backend start:worker
bun run --cwd backend start:cron -- health:check
bun run --cwd backend smoke:docker
bun run --cwd backend prisma:validate
bun run --cwd backend prisma:generate
bun run --cwd backend prisma:migrate
bun run --cwd backend prisma:deploy
```

On Windows PowerShell, use `Copy-Item backend/.env.example backend/.env` instead of `cp`. Workspace aliases are also available from the repository root: `bun run dev:backend`, `bun run build:backend`, `bun run typecheck:backend`, and `bun run test:backend`.

`bun run test:integration` starts `postgres_test` from `../docker-compose.yml`, applies Prisma migrations to `projects_hq_test`, and runs DB-backed auth API tests. If Docker is managed separately, set `TEST_SKIP_DOCKER=1` and `TEST_DATABASE_URL`. The test database name must end with `_test` unless `TEST_ALLOW_NON_TEST_DATABASE=1` is set intentionally.

`bun run smoke:docker` builds the backend Docker image, starts it against `postgres_test`, waits for `/health`, and removes only the smoke container it created.

## Env

Copy `backend/.env.example` to `backend/.env` for local development. The example `DATABASE_URL` matches the Docker Compose `postgres` service documented in [../docs/LOCAL_DATABASE.md](../docs/LOCAL_DATABASE.md): database `projects_hq`, user `superuser`, password `superpassword`, host port `54329`.

The example `TEST_DATABASE_URL` matches the Docker Compose `postgres_test` service: database `projects_hq_test`, user `superuser`, password `superpassword`, manual host port `54330`. Automated runners may replace the port with a repository-derived value so parallel checkouts do not collide.

Keep an explicit username and password in Prisma connection URLs even on local native PostgreSQL installs. Peer-auth style URLs without a user can make Prisma schema-engine commands such as `migrate dev`, `migrate deploy`, and `db push` fail with an unhelpful generic engine error.

`JWT_SECRET` must be at least 32 characters. For production, generate it with `openssl rand -hex 32`; this creates 32 random bytes encoded as 64 hex characters. Do not use the `.env.example` placeholder, repeated characters, or human phrases.

`COOKIE_SECURE=false` is appropriate for local HTTP; production should use `COOKIE_SECURE=true` with exact HTTPS origins in `CORS_ORIGINS`. Production browser auth uses `SameSite=None; Secure` refresh cookies, so wildcard, empty, or path-bearing CORS origins are invalid. Cookie-backed `refresh` and `logout` requests also require a trusted `Origin` in production cookie mode.

Panel-specific settings: `ADMIN_EMAILS` (extra accounts allowed to register after the first admin), `APP_URL` (links in notifications), `HEALTH_CHECK_INTERVAL_SECONDS`, `HEALTH_CHECK_TIMEOUT_MS`, `HEALTH_HISTORY_RETENTION_DAYS`, `GITHUB_TOKEN` + `GITHUB_SYNC_INTERVAL_SECONDS`, `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (both or neither), and `DAILY_DIGEST_HOUR_UTC`.

DigitalOcean Spaces env is optional and unused by the panel today. Leave `SPACES_*` blank; the storage service stays available for future uploads and follows [../docs/STORAGE.md](../docs/STORAGE.md).

## Runtime Entrypoints

The backend is one workspace with one Prisma schema and one Dockerfile, but it has separate runtime entrypoints:

- API: `bun run start:api`, backed by `src/index.ts`.
- Worker: `bun run start:worker`, backed by `src/worker.ts`. It loops forever: availability checks every `HEALTH_CHECK_INTERVAL_SECONDS`, GitHub sync every `GITHUB_SYNC_INTERVAL_SECONDS`, history pruning daily, and the Telegram digest once a day at `DAILY_DIGEST_HOUR_UTC`. Run exactly one instance.
- Cron: `bun run start:cron -- <task>`, backed by `src/cron.ts`. Tasks: `health:check`, `health:prune`, `github:sync`, `digest:daily`, plus `noop` and `db:ping` for infrastructure smoke tests.
- Seed: `bun run seed` inserts the owner's GitHub projects (names, repository links, guessed statuses) once; existing slugs are left untouched.

All entrypoints use `src/runtime.ts` for env loading and Prisma creation, and `src/services.ts` to build the shared feature services.

Primary keys use database-generated UUIDv7 values in PostgreSQL (`@default(dbgenerated("uuidv7()")) @db.Uuid`). PostgreSQL 18+ is required anywhere the schema is applied.

## Deployment

Production deployment for the backend uses DigitalOcean App Platform with DigitalOcean Managed PostgreSQL by default. Follow the shared runbook in [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) instead of duplicating provider-specific steps here. The root `bun run deploy:do:specs` command generates concrete App Platform specs safely under `.scratch/deploy`; do not hand-substitute secrets or URLs into specs. If the user explicitly chooses Yandex Cloud, use [../docs/YANDEX_CLOUD.md](../docs/YANDEX_CLOUD.md).

## API

Public:

- `POST /api/auth/register` (first account, then only `ADMIN_EMAILS`), `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/status`
- `GET /health`, `GET /openapi.json`

Bearer-protected (`Authorization: Bearer <access token>`):

- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET|POST /api/projects`, `GET|PATCH|DELETE /api/projects/:id`, `POST /api/projects/:id/check`
- `GET|POST /api/servers`, `GET|PATCH|DELETE /api/servers/:id`, `POST /api/servers/:id/payments`, `DELETE /api/servers/:id/payments/:paymentId`
- `GET|POST /api/clients`, `GET|PATCH|DELETE /api/clients/:id`
- `GET|POST /api/invoices` (`?status=&clientId=&projectId=`), `GET|PATCH|DELETE /api/invoices/:id`
- `POST /api/health/run` (check every monitored project now)

Passwords are hashed through `Bun.password` with Argon2id. Access tokens are short-lived JWTs through `jose`. Refresh tokens are opaque random tokens; only a SHA-256 hash is stored. Refresh rotates the token and revokes the previous session.

## Architecture

`src/index.ts` only starts the API server. `src/runtime.ts` loads env and creates the Prisma client for API, worker, and cron entrypoints. The Hono app is created in `src/app.ts` and mounts one router per feature (`auth`, `projects`, `servers`, `clients`, `invoices`, `dashboard`, `health`); routes validate and delegate, services own the logic, DTO mapping lives next to each service. `src/db.ts` normalizes DigitalOcean Managed PostgreSQL URLs that use `sslmode=require` so the Prisma PostgreSQL adapter uses libpq-compatible TLS handling. See [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the module map.

The storage service lives in `src/storage` and wraps DigitalOcean Spaces through S3-compatible SDK calls. Product-specific upload routes should validate ownership and permissions, then delegate object key generation, presigned upload/download URLs, public CDN URL construction, and deletion to that service.

Prisma migration SQL is not written by hand. Change `prisma/schema.prisma`, then run `bun run prisma:migrate`.

## Current Upstream Documentation

For backend framework, ORM, auth, validation, and runtime questions, consult the current upstream documentation linked here first. This README describes this backend's conventions; upstream docs are authoritative for API behavior.

- [Bun docs](https://bun.sh/docs)
- [Hono docs](https://hono.dev/docs)
- [Hono Zod OpenAPI example](https://hono.dev/examples/zod-openapi)
- [Prisma docs](https://www.prisma.io/docs)
- [Prisma migrations](https://www.prisma.io/docs/orm/prisma-migrate)
- [PostgreSQL docs](https://www.postgresql.org/docs/)
- [Zod docs](https://zod.dev/)
- [jose documentation](https://github.com/panva/jose)
- [Docker Compose docs](https://docs.docker.com/compose/)
- [PostgreSQL Docker Official Image](https://hub.docker.com/_/postgres)
- [DigitalOcean Spaces docs](https://docs.digitalocean.com/products/spaces/)
- [DigitalOcean Spaces CDN docs](https://docs.digitalocean.com/products/spaces/how-to/enable-cdn/)
