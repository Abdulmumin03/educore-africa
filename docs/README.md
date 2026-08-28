# EduCore Africa

Multi-tenant school management system for African K-12 schools, plus the
internal console the EduCore Africa team runs it from. Built on Next.js 14
(app router), Prisma + Postgres, Redis, BullMQ, TanStack Query, shadcn/ui,
and Claude.

**Two applications, one database:**

| App | Port | Audience | Package |
| --- | --- | --- | --- |
| School platform | 3000 | schools — admins, teachers, bursars, parents | `apps/web` |
| Super Admin Console | 3001 | EduCore Africa staff only | `apps/superadmin` |

This file is the quick start. Deeper guides:

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system map and data flow
- [`API.md`](./API.md) — endpoint inventory for the school platform
- [`SUPERADMIN.md`](./SUPERADMIN.md) — the console: access, roles, surfaces, API, runbook
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

# The console keeps its own overrides — chiefly a SEPARATE JWT secret.
cp apps/superadmin/.env.local.example apps/superadmin/.env.local

# Spin up Postgres + Redis containers
pnpm docker:up

# Install workspace deps
pnpm install

# Apply migrations and generate the Prisma client
pnpm db:migrate
pnpm db:generate

# (Optional) seed demo data + the console accounts
pnpm db:seed

# Start BOTH apps
pnpm dev
```

- School platform → `http://localhost:3000`
- Super Admin Console → `http://localhost:3001/console`

`pnpm dev:web` and `pnpm dev:superadmin` start one at a time.

Background workers run separately:

```bash
pnpm --filter web worker
```

Without the worker, queued jobs (attendance SMS dispatch, etc.) sit in Redis
until you start it. Producers live in `apps/web/lib/queues/`.

### Your first console account

```bash
pnpm --filter superadmin admin:create -- \
  --email you@educoreafrica.com --name "Your Name" \
  --password "…" --role SUPER_ADMIN
```

An account with no TOTP cannot reach the console at all — the first sign-in
redirects to `/enroll-mfa`, walks through the QR code and issues backup codes.
Keep `ALLOWED_IPS` **blank** locally: with no proxy in front, requests carry
no `x-forwarded-for`, the client IP resolves to `unknown`, and any populated
list will lock you out of your own dev server.

## 3. Environment variables

See [`.env.example`](../.env.example) at the repo root for the full list.
The minimum required for local dev:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection (pooled). The docker-compose default works out of the box. |
| `DIRECT_URL` | Direct Postgres connection — required by `prisma migrate`. |
| `REDIS_URL` | Redis URL for sessions, caching, and BullMQ. |
| `NEXTAUTH_SECRET` | Random 32+ char string. **Must be set explicitly** — Auth.js v5 will not derive one, and without it login appears to succeed then bounces. |
| `NEXTAUTH_URL` | `http://localhost:3000` in dev. |

Optional but commonly used in dev:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Without it, AI features (risk scoring, insights, lesson plans, book recs) return graceful empty responses. |
| `AFRICASTALKING_API_KEY` + `AFRICASTALKING_USERNAME` | SMS + USSD. Use the sandbox username for local testing. |
| `PAYSTACK_SECRET_KEY` + `PAYSTACK_PUBLIC_KEY` | Fee collection. Test-mode keys are fine. |
| `AWS_*` + `S3_BUCKET` | Uploads. Without these, presigned-URL routes return 503. |
| `SENTRY_DSN` | Error monitoring. SDK no-ops without it. |

### Console-only variables

These live in `apps/superadmin/.env.local`, **not** the root `.env` — Next
loads the app-local file first, so they override rather than collide with the
school app's values. Everything above (`DATABASE_URL`, `REDIS_URL`,
`ANTHROPIC_API_KEY`, …) is inherited from the root file.

| Variable | Purpose |
| --- | --- |
| `SUPERADMIN_SECRET` | JWT secret **and** the AES key for stored TOTP seeds. Must differ from `NEXTAUTH_SECRET`. |
| `ALLOWED_IPS` | Comma-separated office/VPN allowlist. Blank = allow all in dev, **deny all in production**. |
| `NEXTAUTH_URL` / `AUTH_URL` | Pin sign-in redirects to :3001. |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the console. |
| `CRON_SECRET` | Bearer token for `/api/cron/*`. Unset = those endpoints refuse **every** caller. |
| `CHROMIUM_PATH` | Chromium binary for PDF exports. Unset = PDFs degrade to print-ready HTML. |
| `S3_BUCKET`, `AWS_*` | Where scheduled reports are stored. Unset = Redis, for 7 days. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Report delivery. Unset = the run log says no email was sent. |
| `SEED_SUPERADMIN_PASSWORD` | Initial password for seeded console accounts. |

See [`SUPERADMIN.md`](./SUPERADMIN.md) for what each one changes.

## 4. Common commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start both apps with HMR. |
| `pnpm dev:web` / `pnpm dev:superadmin` | Start one. |
| `pnpm build` | Production build (runs Sentry source-map upload if `SENTRY_AUTH_TOKEN` is set). |
| `pnpm --filter web lint` | ESLint. |
| `pnpm --filter web exec tsc --noEmit` | Typecheck without emit. |
| `pnpm --filter web test` | Run Vitest unit tests. |
| `pnpm --filter web test:watch` | Vitest watch mode. |
| `pnpm --filter superadmin test` | Console unit tests. |
| `pnpm --filter superadmin test:sa10` | Console end-to-end suite (needs a running server). |
| `pnpm db:migrate` | Apply pending Prisma migrations to your local DB. |
| `pnpm db:studio` | Prisma Studio (DB browser). |
| `pnpm db:seed` | Seed demo data. |
| `pnpm docker:up` / `:down` | Start / stop local Postgres + Redis. |

## 5. Project layout

```
educore-africa/
├── apps/
│   ├── web/                 # School platform (:3000)
│   │   ├── app/             # Routes (app router)
│   │   │   ├── api/         # API routes — one folder per resource
│   │   │   ├── dashboard/   # Authenticated dashboard surfaces
│   │   │   └── ...
│   │   ├── components/      # Client + server components, grouped by surface
│   │   ├── lib/             # Pure helpers, API clients, prisma + redis singletons
│   │   └── __tests__/       # Vitest unit tests
│   └── superadmin/          # Super Admin Console (:3001)
│       ├── app/console/     # Protected console surfaces
│       ├── app/api/         # 114 routes — see docs/SUPERADMIN.md
│       ├── lib/             # Session guard, rate limits, AI, reports, exports
│       ├── scripts/         # admin:create, seeds, end-to-end smoke suites
│       └── Dockerfile       # Built from the REPO ROOT
├── packages/
│   └── database/            # Prisma schema + migrations + seeds (shared by both apps)
├── design/                  # Claude Design canvases (.dc.html artboards)
├── docs/                    # You are here
└── .github/workflows/       # ci.yml · deploy.yml (web) · deploy-superadmin.yml
```

The two apps share `packages/database` and **nothing else**. `apps/web` never
imports from `apps/superadmin`, and never queries the `super_admin_*` tables.

## 6. Where to look when something breaks

- A migration won't apply → check Docker is running, then `pnpm docker:up`.
- "Cannot decrypt session cookie" → `NEXTAUTH_SECRET` isn't set.
- AI endpoints return empty arrays → set `ANTHROPIC_API_KEY`.
- SMS jobs queue but never send → start the worker (`pnpm --filter web worker`).
- A new feature you don't recognise → the `lib/` module behind it carries a
  header comment explaining the decisions that are not obvious from the code.

Console-specific:

- Locked out of the console on localhost → clear `ALLOWED_IPS` in
  `apps/superadmin/.env.local`.
- Sign-in succeeds then bounces → `SUPERADMIN_SECRET` is unset, or equal to
  `NEXTAUTH_SECRET`.
- A service reads "Not checked" → its credentials are unset. The console
  refuses to report an unprobed dependency as healthy.
- PDF exports arrive as `.html` → no Chromium. Set `CHROMIUM_PATH`, or use the
  Docker image, which ships it.
- Scheduled reports never run → `CRON_SECRET` is unset, so `/api/cron/*`
  refuses every caller including your scheduler.

More in [`SUPERADMIN.md § 10`](./SUPERADMIN.md#10-runbook).
