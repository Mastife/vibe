# Deployment

Projects HQ is an internal, single-owner panel. The recommended production path is **one of your own VPS servers with Docker Compose** (`deploy/`): it costs nothing extra and keeps the panel next to the projects it watches. DigitalOcean App Platform remains a supported alternative through the committed spec templates.

Local setup from `README.md` and [LOCAL_DATABASE.md](LOCAL_DATABASE.md) does not require cloud credentials. If you explicitly want Yandex Cloud, use [YANDEX_CLOUD.md](YANDEX_CLOUD.md).

## VPS With Docker Compose

Requirements: a VPS with Docker Engine + Compose plugin, a domain with an A/AAAA record pointing at it, ports 80 and 443 open.

```bash
git clone git@github.com:Mastife/projects-hq.git
cd projects-hq
cp deploy/.env.production.example deploy/.env.production
# fill in HQ_DOMAIN, POSTGRES_PASSWORD (openssl rand -hex 24), JWT_SECRET (openssl rand -hex 32),
# and optionally TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / GITHUB_TOKEN / ADMIN_EMAILS
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d --build
```

What the stack runs:

- `postgres` - PostgreSQL 18 with a named volume.
- `migrate` - one-shot `prisma migrate deploy`; `api` and `worker` wait for it.
- `api` - the Hono API on port 8080 inside the network.
- `worker` - `bun run start:worker`: availability checks, GitHub sync, history pruning, daily Telegram digest.
- `web` - Caddy serving the built SPA and proxying `/api/*` to the API on the same origin; TLS certificates are issued automatically for `HQ_DOMAIN`.

Because the SPA and the API share one origin, `CORS_ORIGINS`, `APP_URL`, and `VITE_API_URL` are all derived from `HQ_DOMAIN` inside the compose file.

First login: open `https://<HQ_DOMAIN>` and create the first account; registration then closes. Optional one-time import of projects from the owner's GitHub list:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production exec api bun run seed
```

Updating:

```bash
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d --build
```

Backups: `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production exec postgres pg_dump -U hq projects_hq > backup.sql`.

## Release Source Preflight

Before any deployment or cloud-resource update, verify the release source:

```bash
git remote -v
git status --short --branch
```

Deploy only from the intended release branch after the intended commit is pushed and the local branch is in sync with its upstream. If the worktree has modified, deleted, or untracked files, stop and report that deployment is blocked. Do not run `git reset`, `git checkout --`, `git clean`, `git stash`, or equivalent cleanup to make deployment possible unless the user explicitly requested that exact destructive action.

DigitalOcean App Platform builds from the connected Git branch, not from local `dist` folders or uncommitted files. A dirty local checkout can still cause an agent to deploy the wrong branch, generate specs from the wrong release source, or erase another session's work while trying to make the branch clean. The supported failure mode is to stop, not to repair the checkout.

## Secrets And Backend Env

Do not store secrets in the repository. Minimum backend production env:

```bash
DATABASE_URL=postgresql://...
JWT_SECRET=<at-least-32-random-characters>
CORS_ORIGINS=https://hq.example.com
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
COOKIE_SECURE=true
APP_URL=https://hq.example.com
# optional: ADMIN_EMAILS, TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, GITHUB_TOKEN,
# HEALTH_CHECK_INTERVAL_SECONDS, HEALTH_CHECK_TIMEOUT_MS, DAILY_DIGEST_HOUR_UTC
```

`CORS_ORIGINS` must include every browser origin that calls the API with credentials. Use exact origins only, for example `https://web.example.com`; do not use wildcards, empty values, or paths.

`JWT_SECRET` belongs in the production backend runtime env. Generate it with `openssl rand -hex 32`; that command creates 32 random bytes encoded as 64 hex characters. Do not use the placeholder from `.env.example`, repeated characters, or human phrases.

If storage is active, also configure:

```bash
SPACES_REGION=nyc3
SPACES_BUCKET=<project-prod>
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
SPACES_CDN_BASE_URL=https://images.example.com
SPACES_ACCESS_KEY_ID=<spaces-access-key>
SPACES_SECRET_ACCESS_KEY=<spaces-secret-key>
SPACES_UPLOAD_MAX_BYTES=10485760
SPACES_UPLOAD_URL_TTL_SECONDS=900
SPACES_DOWNLOAD_URL_TTL_SECONDS=300
SPACES_PUBLIC_CACHE_CONTROL="public, max-age=31536000, immutable"
```

## DigitalOcean App Platform

Prerequisites:

1. DigitalOcean account with billing enabled.
2. A project and region chosen close to the expected users.
3. `doctl` installed and authenticated:

```bash
doctl auth init
```

4. DigitalOcean App Platform GitHub integration connected in the DigitalOcean Dashboard, with access to the user's repository before `doctl apps create`. Without this, `doctl apps create` can fail with `GitHub user not authenticated`.
5. DigitalOcean Managed PostgreSQL for production. Do not use App Platform dev databases for production data.
6. DigitalOcean Spaces Standard Storage with Spaces CDN when uploads, images, media, exports, or downloads are in scope.
7. DigitalOcean Managed Valkey only when horizontally scaled real-time features need Pub/Sub between backend instances.
8. Production domains and DNS access when custom domains are in scope.

Prefer an App Platform app spec so the backend service, static sites, env, domains, and database attachment stay reviewable. Create or update with:

```bash
doctl apps create --spec <path-to-spec.yaml>
doctl apps update <app-id> --spec <path-to-spec.yaml>
```

Consult the current App Spec docs before applying a generated spec because provider fields and limits can change.

## Safe DigitalOcean App Spec Workflow

Keep committed spec templates under `.do/*.yaml.example`. Generate concrete specs only into `.scratch/deploy` with:

```bash
bun run deploy:do:specs <backend-initial|backend-final|web|all>
```

The generator rejects empty `value:` lines, unresolved `REPLACE_WITH_*` placeholders, wildcard/empty/path-bearing production CORS origins, short, placeholder, or obviously weak `JWT_SECRET`, and missing build-time static URLs. Do not replace secrets or URLs with manual `sed`, `perl`, or shell one-liners.

The generator also refuses to run unless the current checkout is on the configured deployment branch, the branch tracks a pushed upstream, the branch is not ahead/behind/diverged, and the worktree has no uncommitted or untracked changes.

Concrete App Platform machine defaults live in [../scripts/prepare-do-specs.mjs](../scripts/prepare-do-specs.mjs), not in generated `.scratch` files. The `.do/*.yaml.example` templates intentionally keep budget-bearing values as placeholders so the generator can validate and test them. When changing default tiers, update the generator constants, generator tests, and this document in the same change.

Minimum environment for spec generation:

```bash
export DO_GITHUB_REPO=owner/repo
export DO_PROJECT_SLUG=project-slug
export DO_GIT_BRANCH=main
export DO_APP_REGION=fra
export JWT_SECRET="$(openssl rand -hex 32)"
```

Optional API sizing overrides for an installed project:

```bash
export DO_API_INSTANCE_SIZE_SLUG=apps-s-1vcpu-1gb
export DO_API_INSTANCE_COUNT=1
```

Reuse the same `JWT_SECRET` for later `backend-final` updates unless the user intentionally wants to invalidate all existing sessions.

Typical first deploy order:

```bash
# 1. Create backend with a temporary placeholder browser origin.
bun run deploy:do:specs backend-initial
doctl apps spec validate .scratch/deploy/backend-app.yaml
doctl apps create --spec .scratch/deploy/backend-app.yaml

# 2. After the backend URL exists, create the web static app.
export DO_BACKEND_URL=https://<api-default-ingress>
bun run deploy:do:specs web
doctl apps spec validate .scratch/deploy/web-static-app.yaml
doctl apps create --spec .scratch/deploy/web-static-app.yaml

# 3. After the web URL exists, update backend CORS and add the monitoring worker.
export DO_WEB_URL=https://<web-default-ingress>
export DO_BACKEND_WORKER_ENABLED=true
bun run deploy:do:specs backend-final
doctl apps spec validate .scratch/deploy/backend-app.yaml
doctl apps update <backend-app-id> --spec .scratch/deploy/backend-app.yaml
```

Static Sites build from the connected Git branch, not from local `dist` folders. The branch must contain the full web/backend monorepo: root `package.json`, `bun.lock`, `backend`, `web`, and `packages/contracts`.

## Backend API

The backend runs as an App Platform web service. Keep the Docker build context at the repository root because [../backend/Dockerfile](../backend/Dockerfile) copies workspace manifests and `packages/contracts`.

Supported build paths:

- Repository build: App Platform service uses `dockerfile_path: backend/Dockerfile` with repository-root build context.
- Container image: build and push to DOCR, then point the App Platform service at that image.

DOCR image workflow:

```bash
docker build -f backend/Dockerfile -t registry.digitalocean.com/<registry>/<project>-backend:latest .
doctl registry login
docker push registry.digitalocean.com/<registry>/<project>-backend:latest
```

Backend service requirements:

- Set both the service `http_port` and `PORT` env to `8080` unless the project has a reason to choose another port.
- Use `instance_size_slug: apps-s-1vcpu-1gb` and `instance_count: 1` as the default production API starter shape. This is one shared 1 vCPU / 1 GiB App Platform container, which is the $12/month single-container option as of May 2026.
- Configure health checks to hit `/health`.
- Set `COOKIE_SECURE=true` for HTTPS production traffic.
- Set `CORS_ORIGINS` to the exact deployed browser origins. Do not use `*`, empty values, or URLs with paths.
- Attach DigitalOcean Managed PostgreSQL or provide its connection string as `DATABASE_URL`.
- Add Spaces env only when the product uses storage. Leave Spaces env blank for projects without uploads.

The default one-container shape is not a high-availability floor; it is the budget starter that keeps backend plus the smallest Managed PostgreSQL cluster around $27/month before taxes, traffic overages, storage, and optional add-ons. Raise `instance_count` to two or three when availability or traffic justifies the extra monthly cost. Use `apps-s-1vcpu-2gb` or larger shared containers when memory pressure is the primary limit. Move to dedicated CPU only after metrics show CPU-bound work, noisy shared-CPU performance, strict latency requirements, or a need for CPU-based autoscaling. `web` is a Static Site component and does not have an App Platform runtime container size.

Apply Prisma migrations from a protected one-off App Platform console/job with the same production env:

```bash
bun run --cwd backend prisma:deploy
```

Do not run `prisma migrate dev` in production and do not hand-write migration SQL.

## Backend Worker And Cron

The backend ships as one Docker image with separate entrypoints:

- API service: `bun run start:api`
- monitoring worker: `bun run start:worker` (health checks, GitHub sync, history pruning, daily digest)
- one-shot cron runner: `bun run start:cron -- <task>` with tasks `health:check`, `health:prune`, `github:sync`, `digest:daily`, `noop`, `db:ping`

The worker is required for monitoring and Telegram alerts to happen without anyone opening the panel. Run exactly one worker instance.

On DigitalOcean App Platform, `DO_BACKEND_WORKER_ENABLED=true` adds a worker component that runs `bun run start:worker` by default (override with `DO_BACKEND_WORKER_RUN_COMMAND` only for a custom entrypoint). Scheduled job components can still run one-shot tasks, but App Platform's minimum cadence is 15 minutes, so prefer the worker for availability checks:

```bash
export DO_BACKEND_WORKER_ENABLED=true

# Optional scheduled job, for example a nightly history prune.
export DO_BACKEND_CRON_NAME=nightly-prune
export DO_BACKEND_CRON_TASK=health:prune
export DO_BACKEND_CRON_SCHEDULE="0 3 * * *"
export DO_BACKEND_CRON_TIME_ZONE=UTC

bun run deploy:do:specs backend-final
```

Both optional components use `backend/Dockerfile`, the repository-root build context, and the same managed PostgreSQL binding as the API. Add `TELEGRAM_*`, `GITHUB_TOKEN`, and `APP_URL` to the worker component when notifications and GitHub sync are wanted in production.

## Real-Time And Horizontal Scaling

Keep production architecture monolithic: one API service, one worker, one PostgreSQL. The panel has no WebSocket layer.

When the backend runs as a single instance, WebSocket connection state can stay in that process. When App Platform is scaled to multiple containers, clients may connect to different backend instances. Any feature that must deliver the same event across those instances, such as chat messages, presence changes, or live notifications, needs a shared Pub/Sub broker.

Use DigitalOcean Managed Valkey as the default Redis-compatible broker for cross-instance fanout. Each backend instance publishes domain events to Valkey and subscribes to the channels it needs to deliver events to its local WebSocket connections. Do not add Valkey for ordinary request/response APIs, static pages, or single-instance development.

Valkey is a transient delivery layer, not the source of truth. Persist durable state in PostgreSQL first, publish small event messages after the write commits, and have each backend instance fan out only to its own local WebSocket or SSE clients. Clients should reconnect and refetch from the API because Pub/Sub messages can be missed during deploys, restarts, or network interruptions.

When a real-time feature needs cross-instance delivery, create a DigitalOcean Managed Valkey cluster in the same region as the app and database, attach the connection string to the backend as a runtime secret such as `VALKEY_URL`, and keep it out of static-site build-time env. Do not enable Valkey in the baseline template until the product has a realtime feature that requires it.

## Web Static Site

Deploy `web` as an App Platform Static Site component.

The minimum sufficient frontend tier is Static Site only. Do not add `instance_size_slug`, `instance_count`, or a service/container component for the browser app unless the product later needs server-side rendering or a frontend runtime process.

Required component shape:

- Source directory/build context: repository root.
- Build command: `bun install --frozen-lockfile && bun run build:web`.
- Output directory: `web/dist`.
- Build-time env: `VITE_API_URL=https://api.example.com`.
- Index document: `index.html`.
- Catch-all document: `index.html`, because the React app uses client-side routing.

App Platform Static Sites are served through DigitalOcean's global CDN by default. Do not disable the CDN cache unless the product needs a specific behavior that the built-in CDN cannot provide.

`VITE_API_URL` is embedded at build time. If it is empty, the browser app can call its own static-site origin at `/api/*` instead of the backend. After changing `VITE_API_URL`, redeploy the static site; runtime env changes alone do not rewrite the already built bundle.

## Managed PostgreSQL

Use DigitalOcean Managed PostgreSQL for production data. For a new low-cost production launch, start with the Basic Regular 1 GiB / 1 vCPU cluster with no standby nodes; it is $15.15/month as of May 2026. When attaching the database inside App Platform, prefer bindable variables such as the database component's `DATABASE_URL`/`DATABASE_PRIVATE_URL` rather than copying raw credentials into the spec.

Operational defaults:

- Keep the database in the same region/VPC as the backend service when possible.
- Enable trusted sources for the App Platform app when using managed database network restrictions.
- Use a connection pool if the app starts hitting connection limits.
- Take backups before destructive schema or data operations.

DigitalOcean Managed PostgreSQL uses TLS. The backend normalizes `sslmode=require` database URLs by adding `uselibpqcompat=true` for the Prisma PostgreSQL adapter unless the URL already sets that option explicitly.

## Production Auth And CORS

Production browser auth runs cross-origin when backend and web use different `*.ondigitalocean.app` domains or custom domains. The required shape is:

- backend cookies: `HttpOnly`, `Secure`, `SameSite=None`, scoped to `/api/auth`;
- backend CORS: exact HTTPS origins only, `credentials: true`, no wildcard fallback;
- cookie-based `refresh` and `logout`: require an `Origin` header that exactly matches `CORS_ORIGINS`;
- web API client: `credentials: include`;
- web static build: concrete `VITE_API_URL` pointing at the backend origin.

The backend env validator rejects empty/wildcard/path-bearing `CORS_ORIGINS`, rejects HTTP origins when `COOKIE_SECURE=true`, and rejects placeholder or obviously weak `JWT_SECRET` values in production-like runtimes.

## Spaces Storage

Use DigitalOcean Spaces Standard Storage plus Spaces CDN for persistent files and media. Do not write uploads to the App Platform container filesystem; it is not durable across deployments or container replacements.

Default production setup:

- Create a Standard Storage Space in the same region group as the backend when practical.
- Enable Spaces CDN for public media and use a custom subdomain such as `images.example.com` when the project has a production domain.
- Configure Spaces CORS for browser direct uploads from deployed web origins.
- Use backend-issued presigned PUT URLs for direct uploads.
- Use public CDN URLs for public immutable media.
- Use short-lived presigned GET URLs for private files.
- Generate optimized image variants in the backend, a worker, or a dedicated App Platform service when the product needs thumbnails, responsive sizes, compression, or format conversion.

DigitalOcean Spaces and Spaces CDN do not provide first-party dynamic image transformation. Add third-party image services only when the user explicitly chooses that product tradeoff.

## CDN And Domains

For `web`, App Platform Static Sites already use DigitalOcean's global CDN. This is the default path.

Use an external CDN only for explicit advanced needs such as custom WAF rules, bot filtering, custom rate limiting, or geographic traffic controls. If an external CDN is used in front of App Platform:

- configure the custom domain on the CDN, not in App Platform;
- point the CDN origin to the default App Platform ingress, for example `<app-name>.ondigitalocean.app`;
- use HTTPS on port `443`;
- do not forward the original custom-domain `Host` header to App Platform.

## Validation

Before changing cloud resources, run the smallest relevant local checks for the active surfaces:

```bash
bun run typecheck
bun run test
bun run build
```

For narrow deployment-only documentation or App Platform config work, run the subset that matches the affected surfaces, for example `bun run deploy:do:specs all`, `bun run build:web`, or `bun run --cwd backend smoke:docker`.

After deployment:

- verify `doctl apps spec validate <generated-spec.yaml>` passes for every generated spec before create/update;
- verify `/health` on the backend public URL;
- verify browser auth only from allowed `CORS_ORIGINS`;
- verify `web` route refreshes hit the React catch-all instead of a static 404;
- verify public media loads through the Spaces CDN domain when storage is active;
- verify private file links expire and require backend authorization when private storage is active;
- verify Prisma migrations were applied exactly once to the production database.

## Failure Modes This Template Guards Against

- `GitHub user not authenticated`: App Platform GitHub integration was not connected or did not have repository access before `doctl apps create`.
- Empty secrets or URLs in generated specs: `JWT_SECRET`, `CORS_ORIGINS`, `VITE_API_URL`, and `PUBLIC_WEB_APP_URL` must be concrete before deployment.
- Dirty or ambiguous release source: deployment tooling must stop when the worktree has uncommitted/untracked files, the checkout branch differs from `DO_GIT_BRANCH`, or the branch is not pushed and in sync.
- Backend crash on startup: empty, placeholder, or obviously weak `JWT_SECRET` is rejected by env validation, so the spec generator must fail before App Platform deploys it.
- Broken browser auth CORS: production CORS must use exact HTTPS origins, not wildcard or empty values.
- Web calling its own `/api/*`: missing `VITE_API_URL` at static build time makes the bundle use the wrong origin.
- Stale remote build dependencies: static site build commands run `bun install --frozen-lockfile` before `bun run build:*`.
- Frozen backend install failures: `backend/Dockerfile` copies all workspace manifests before `bun install --frozen-lockfile`.
- Wrong App Platform port: backend specs set both `http_port: 8080` and `PORT=8080`.
- Managed PostgreSQL TLS errors: `sslmode=require` URLs are normalized with `uselibpqcompat=true` for the Prisma PostgreSQL adapter.
- Cross-origin cookie failures: production cookies use `Secure` and `SameSite=None`; web requests include credentials.
- Missing monorepo files in Git: App Platform Static Sites build from the connected Git branch, not from local `dist`.

## Current Upstream Documentation

For deployment questions, consult current upstream docs first. This document captures the repository's deployment shape; provider docs are authoritative for CLI flags, product limits, pricing, and service behavior.

- DigitalOcean App Platform: https://docs.digitalocean.com/products/app-platform/
- Create apps on App Platform: https://docs.digitalocean.com/products/app-platform/how-to/create-apps/
- DigitalOcean App specs: https://docs.digitalocean.com/products/app-platform/reference/app-spec/
- DigitalOcean Static Sites: https://docs.digitalocean.com/products/app-platform/how-to/manage-static-sites/
- DigitalOcean Managed Databases in App Platform: https://docs.digitalocean.com/products/app-platform/how-to/manage-databases/
- DigitalOcean Valkey: https://docs.digitalocean.com/products/databases/valkey/
- DigitalOcean Dockerfile builds: https://docs.digitalocean.com/products/app-platform/reference/dockerfile/
- DigitalOcean Bun buildpack: https://docs.digitalocean.com/products/app-platform/reference/buildpacks/bun/
- DigitalOcean doctl CLI: https://docs.digitalocean.com/reference/doctl/
- DigitalOcean `doctl apps spec validate`: https://docs.digitalocean.com/reference/doctl/reference/apps/spec/validate/
- DigitalOcean Container Registry: https://docs.digitalocean.com/products/container-registry/
- DigitalOcean Spaces: https://docs.digitalocean.com/products/spaces/
- DigitalOcean Spaces CDN: https://docs.digitalocean.com/products/spaces/how-to/enable-cdn/
- DigitalOcean Spaces S3 compatibility: https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/
- Configure CORS on Spaces: https://docs.digitalocean.com/products/spaces/how-to/configure-cors/
- External CDN in front of App Platform: https://docs.digitalocean.com/products/app-platform/how-to/configure-external-cdn/
- Yandex Cloud alternative runbook: https://yandex.cloud/en/docs/
- Docker Compose: https://docs.docker.com/compose/
- Prisma migrations: https://www.prisma.io/docs/orm/prisma-migrate
