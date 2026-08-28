# syntax=docker/dockerfile:1.7
#
# EduCore Africa — Super Admin Console (internal, port 3001).
#
# Built from the REPOSITORY ROOT, not from this directory:
#
#   docker build -f apps/superadmin/Dockerfile -t educore-superadmin .
#
# The console shares `@educore/database` with the school app, so the whole
# workspace has to be present for the install to resolve.

# ---------- deps stage --------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /repo

RUN corepack enable

# Manifests first, so the dependency layer caches independently of source.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY turbo.json ./
COPY apps/superadmin/package.json apps/superadmin/
COPY packages/database/package.json packages/database/

# The lockfile covers every workspace, so `apps/web`'s manifest has to exist
# for --frozen-lockfile to be satisfiable even though it is never built here.
COPY apps/web/package.json apps/web/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- builder stage ----------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /repo
RUN corepack enable

ENV NEXT_TELEMETRY_DISABLED=1
ARG APP_VERSION=1.0.0
ENV APP_VERSION=${APP_VERSION}

COPY --from=deps /repo /repo
COPY . .

RUN pnpm --filter @educore/database exec prisma generate
RUN pnpm --filter superadmin build

# ---------- runner stage -----------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# Chromium, for the PDF exports. `renderPdf` degrades to print-ready HTML
# without it, so this is the difference between the audit log and report
# builder handing out real PDFs and handing out HTML that prints to one.
# Playwright's own browser download is skipped in favour of the distro build,
# which is a fraction of the size and gets security updates from apt.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       chromium \
       fonts-liberation \
       ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN groupadd --system --gid 1001 educore && \
    useradd --system --uid 1001 --gid educore --shell /bin/false educore

# No `output: "standalone"` — the app imports a workspace package, which the
# standalone tracer does not follow cleanly here, so the built app plus the
# workspace node_modules is copied instead.
COPY --from=builder --chown=educore:educore /repo/apps/superadmin/.next /app/.next
COPY --from=builder --chown=educore:educore /repo/apps/superadmin/public /app/public
COPY --from=builder --chown=educore:educore /repo/apps/superadmin/package.json /app/package.json
COPY --from=builder --chown=educore:educore /repo/apps/superadmin/next.config.mjs /app/next.config.mjs
COPY --from=builder --chown=educore:educore /repo/node_modules /app/node_modules
COPY --from=builder --chown=educore:educore /repo/packages /app/packages

USER educore

EXPOSE 3001

# /api/health is deliberately outside the IP allowlist and the session guard —
# the daemon making this request is not on the office network and has no
# cookie. It returns 503 when Postgres or Redis is unreachable, so an
# unhealthy container is one that genuinely cannot serve.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3001"]
