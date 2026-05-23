# EduCore Africa

Multi-tenant school management system for African K-12 schools. Built on
Next.js 14 (app router), Prisma + Postgres, Redis, BullMQ, TanStack Query,
shadcn/ui, and Claude.

This file is the quick start. Deeper guides:

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system map and data flow
- [`API.md`](./API.md) — endpoint inventory by surface
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — production deployment runbook

---

## 1. Prerequisites

- Node.js **20.x**
- pnpm **9+** (Corepack: `corepack enable && corepack prepare pnpm@9 --activate`)
- Docker Desktop (for local Postgres + Redis)
- An Anthropic API key (optional in dev — AI features no-op without it)

## 2. First run

```bash
git clone <repo>
cd educore-africa

cp .env.example .env
# Fill in the required vars (see "Environment variables" below).

# Spin up Postgres + Redis containers
pnpm docker:up

# Install workspace deps
pnpm install

# Apply migrations and generate the Prisma client
pnpm db:migrate
pnpm db:generate

# (Optional) seed demo data
pnpm db:seed

# Start the dev server
pnpm dev
```

The app is at `http://localhost:3000`. Background workers run separately:

```bash
pnpm --filter web worker
```

Without the worker, queued jobs (attendance SMS dispatch, etc.) sit in Redis
until you start it. See [`project_p05_worker.md`](../../memory/project_p05_worker.md).

## 3. Environment variables

See [`.env.example`](../.env.example) at the repo root for the full list.
The minimum required for local dev:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection (pooled). The docker-compose default works out of the box. |
| `DIRECT_URL` | Direct Postgres connection — required by `prisma migrate`. |
| `REDIS_URL` | Redis URL for sessions, caching, and BullMQ. |
| `NEXTAUTH_SECRET` | Random 32+ char string. **Must be set explicitly** ([Auth.js gotcha](../../memory/feedback_auth_secret.md)). |
| `NEXTAUTH_URL` | `http://localhost:3000` in dev. |

Optional but commonly used in dev:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Without it, AI features (risk scoring, insights, lesson plans, book recs) return graceful empty responses. |
| `AFRICASTALKING_API_KEY` + `AFRICASTALKING_USERNAME` | SMS + USSD. Use the sandbox username for local testing. |
| `PAYSTACK_SECRET_KEY` + `PAYSTACK_PUBLIC_KEY` | Fee collection. Test-mode keys are fine. |
| `AWS_*` + `S3_BUCKET` | Uploads. Without these, presigned-URL routes return 503. |
| `SENTRY_DSN` | Error monitoring. SDK no-ops without it. |

## 4. Common commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Next.js dev server with HMR. |
| `pnpm build` | Production build (runs Sentry source-map upload if `SENTRY_AUTH_TOKEN` is set). |
| `pnpm --filter web lint` | ESLint. |
| `pnpm --filter web exec tsc --noEmit` | Typecheck without emit. |
| `pnpm --filter web test` | Run Vitest unit tests. |
| `pnpm --filter web test:watch` | Vitest watch mode. |
| `pnpm db:migrate` | Apply pending Prisma migrations to your local DB. |
| `pnpm db:studio` | Prisma Studio (DB browser). |
| `pnpm db:seed` | Seed demo data. |
| `pnpm docker:up` / `:down` | Start / stop local Postgres + Redis. |

## 5. Project layout

```
educore-africa/
├── apps/
│   └── web/                 # Next.js app
│       ├── app/             # Routes (app router)
│       │   ├── api/         # API routes — one folder per resource
│       │   ├── dashboard/   # Authenticated dashboard surfaces
│       │   └── ...
│       ├── components/      # Client + server components, grouped by surface
│       ├── lib/             # Pure helpers, API clients, prisma + redis singletons
│       └── __tests__/       # Vitest unit tests
├── packages/
│   └── database/            # Prisma schema + migrations
├── memory/                  # Per-phase context for future work (project_pXX_*.md)
├── docs/                    # You are here
└── .github/workflows/       # CI + deploy pipelines
```

## 6. Where to look when something breaks

- A migration won't apply → check Docker is running, then `pnpm docker:up`.
- "Cannot decrypt session cookie" → `NEXTAUTH_SECRET` isn't set ([gotcha doc](../../memory/feedback_auth_secret.md)).
- AI endpoints return empty arrays → set `ANTHROPIC_API_KEY`.
- SMS jobs queue but never send → start the worker (`pnpm --filter web worker`).
- A new feature you don't recognise → check `/memory/project_pXX_*.md` for the
  spec that introduced it and the non-obvious wiring.
