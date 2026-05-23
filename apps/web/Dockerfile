# syntax=docker/dockerfile:1.7

# ---------- deps stage --------------------------------------------------
# Installs the entire monorepo's dependencies. We need the whole workspace
# because the web app depends on the `@educore/database` workspace package.
FROM node:20-bookworm-slim AS deps
WORKDIR /repo

# Enable pnpm via Corepack — no global install, version pinned in
# package.json's "packageManager" field.
RUN corepack enable

# Copy workspace manifests first so the dependency layer caches independently
# of source changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- builder stage ----------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /repo
RUN corepack enable

ENV NEXT_TELEMETRY_DISABLED=1
ARG APP_VERSION=1.0.0
ENV APP_VERSION=${APP_VERSION}

# Copy installed node_modules from the deps stage so we don't reinstall.
COPY --from=deps /repo /repo
# Then layer the full source on top.
COPY . .

# Generate Prisma Client + build Next.js
RUN pnpm --filter @educore/database exec prisma generate
RUN pnpm --filter web build

# ---------- runner stage -----------------------------------------------
# Minimal production image. Doesn't need pnpm or any source — just the
# built standalone output, public assets, and runtime node_modules.
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user
RUN groupadd --system --gid 1001 educore && \
    useradd --system --uid 1001 --gid educore --shell /bin/false educore

# next.js standalone output (would need `output: "standalone"` in next.config).
# Since the current config doesn't ship standalone, copy the full app dir.
COPY --from=builder --chown=educore:educore /repo/apps/web/.next /app/.next
COPY --from=builder --chown=educore:educore /repo/apps/web/public /app/public
COPY --from=builder --chown=educore:educore /repo/apps/web/package.json /app/package.json
COPY --from=builder --chown=educore:educore /repo/node_modules /app/node_modules
COPY --from=builder --chown=educore:educore /repo/packages /app/packages

USER educore

EXPOSE 3000

# Liveness probe pings /api/health every 30s; container is marked unhealthy
# after 3 consecutive failures.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "node_modules/next/dist/bin/next", "start"]
