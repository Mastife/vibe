FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY backend/package.json backend/package.json
COPY web/package.json web/package.json

RUN bun install --frozen-lockfile

COPY packages/contracts packages/contracts
COPY backend backend

WORKDIR /app/backend

RUN DATABASE_URL="postgresql://superuser:superpassword@localhost:5432/projects_hq?schema=public" bun run prisma:generate

ENV NODE_ENV=production

CMD ["bun", "run", "start"]
