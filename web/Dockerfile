# Builds the SPA and serves it with Caddy, which also terminates TLS and proxies /api to the backend.
FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY backend/package.json backend/package.json
COPY web/package.json web/package.json

RUN bun install --frozen-lockfile

COPY packages/contracts packages/contracts
COPY web web

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN bun run --cwd web build

FROM caddy:2-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/web/dist /srv
