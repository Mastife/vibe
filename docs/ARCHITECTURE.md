# Architecture

Projects HQ is a single-owner admin panel: shared contracts, one backend with an API and a background worker, and one browser app. There is intentionally no landing page and no mobile app.

## Contracts

`packages/contracts` is the source of truth for API payloads, DTOs, and error shapes:

- `auth.ts` - register/login/refresh/me plus `GET /api/auth/status` (whether registration is open and whether this is the first run).
- `projects.ts` - project DTO with embedded health (`status`, latency, uptime 24h/7d, SSL expiry) and repository activity, create/update payloads, health-run DTO.
- `servers.ts` - server DTO with derived payment state (`OK`, `DUE_SOON`, `OVERDUE`, `UNKNOWN`), payment log DTO, payment recording payload.
- `clients.ts`, `invoices.ts` - client DTO with outstanding totals per currency; invoice DTO with derived `isOverdue`.
- `dashboard.ts` - aggregated overview: counters, per-currency money totals, alerts, and the lists the overview page renders.
- `common.ts` - blank-to-null preprocessing, money parsing (`"1 500,50"` -> `1500.5`), date-only strings, currency codes.

Update schemas are derived from a default-free base (`fieldsSchema.partial()`), because Zod applies `.default()` even under `.partial()` and would silently reset fields on PATCH. Validation messages are Russian (`z.config(z.locales.ru())` in the package entry) because the UI is Russian.

## Backend

```text
Hono route -> Zod validation -> requireAuth guard -> feature service -> Prisma -> DTO
```

- `src/index.ts` - API entrypoint. `src/worker.ts` - long-running scheduler. `src/cron.ts` - one-shot tasks (`health:check`, `health:prune`, `github:sync`, `digest:daily`, `noop`, `db:ping`).
- `src/services.ts` - wires every feature service once so the API, worker, and cron share the same object graph; tests inject a fake fetch and a deterministic health probe here.
- `src/auth/*` - JWT access tokens, rotating refresh sessions, `requireAuth` middleware, and registration lockdown (first account only, then `ADMIN_EMAILS`).
- `src/projects`, `src/servers`, `src/clients`, `src/invoices` - CRUD services and OpenAPI routes. Derived values (uptime, payment state, overdue flags, outstanding totals) are computed in services, never stored.
- `src/health/*` - `checker.ts` performs one HTTP(S) probe with timeout plus a TLS handshake for certificate expiry; `service.ts` persists runs, updates the project's last-known state, prunes history, and notifies on UP/DOWN transitions.
- `src/dashboard/*` - `alerts.ts` is a pure function that turns DTOs into prioritized alerts; `service.ts` composes the overview from the feature services.
- `src/notifications/*` - Telegram notifier (never throws) and the daily digest formatter/scheduler.
- `src/github/sync.ts` - refreshes last push and open issue counters for GitHub-linked projects.
- `src/http/*` - error shapes, OpenAPI helpers, Prisma/driver-adapter error mapping (404 for missing rows, 409 for restricted deletes and duplicates, 400 for missing relations).

Money is stored as `Decimal(14,2)` and exposed as numbers. Date-only columns (`paidUntil`, `issuedAt`, `dueAt`, `paidAt`) travel as `YYYY-MM-DD` strings and are stored as UTC-midnight dates.

## Worker

`bun run start:worker` runs four loops in one process: health checks every `HEALTH_CHECK_INTERVAL_SECONDS`, GitHub sync every `GITHUB_SYNC_INTERVAL_SECONDS`, history pruning daily, and a minute-level tick that sends the Telegram digest once per day at `DAILY_DIGEST_HOUR_UTC`. A failing run is logged and never stops the loop; SIGTERM aborts all loops. A single worker instance is enough; do not run two in parallel or checks will double.

## Web

- `src/routes.tsx` - TanStack Router tree; `components/root-layout.tsx` gates everything behind the session (loading -> login screen -> app shell).
- `src/lib/api.ts` - typed API client with transparent token refresh; `src/lib/queries.ts` - TanStack Query hooks; every mutation invalidates all queries because the overview depends on every entity.
- `src/pages/*` - overview, projects, project detail (health history chart + table twin), servers, server detail (payment log), clients, invoices.
- `src/components/*` - forms (TanStack Form + contract schemas, errors mapped per field), status badges (icon + label, never color alone), dashboard tiles and lists.
- Typography goes through `src/components/ui/typography.tsx`; the ESLint typography policy enforces it.

## Real-time and scaling

The panel is single-tenant and low-traffic: one API instance, one worker, one PostgreSQL. There is no WebSocket layer; the overview refetches every minute. If the API is ever scaled horizontally, keep exactly one worker instance.
