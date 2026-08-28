# EduCore Africa

Multi-tenant school-management software for African K-12 schools, and the
internal console the EduCore Africa team runs it from.

Two Next.js applications, one Postgres database, one Prisma schema:

| App | Port | Who uses it | Package |
| --- | --- | --- | --- |
| **School platform** | 3000 | school admins, teachers, bursars, parents | `apps/web` |
| **Super Admin Console** | 3001 | EduCore Africa staff only | `apps/superadmin` |

They share `packages/database` and nothing else. The console reads across
every tenant; the school app never sees another school's data and never
touches the `super_admin_*` tables. Keeping that boundary is the single most
important rule in this repo.

---

## Quick start

```bash
corepack enable && corepack prepare pnpm@9 --activate

git clone <repo> && cd educore-africa
cp .env.example .env                              # fill in the required vars
cp apps/superadmin/.env.local.example apps/superadmin/.env.local

pnpm docker:up            # local Postgres + Redis
pnpm install
pnpm db:migrate           # apply migrations
pnpm db:generate          # generate the Prisma client
pnpm db:seed              # demo school + console accounts (optional)

pnpm dev                  # starts BOTH apps via turbo
```

- School platform → <http://localhost:3000>
- Super Admin Console → <http://localhost:3001/console>

Queued work (attendance SMS, scheduled announcements) needs a **separate
worker process** — without it, jobs sit in Redis and nothing dispatches:

```bash
pnpm --filter web worker
```

To create your first console account:

```bash
pnpm --filter superadmin admin:create -- \
  --email you@educoreafrica.com --name "Your Name" \
  --password "…" --role SUPER_ADMIN
```

An account with no TOTP cannot reach the console — the first sign-in walks
through enrolment and issues backup codes.

## Documentation

| Doc | What it covers |
| --- | --- |
| [`docs/README.md`](./docs/README.md) | Setup, environment variables, day-to-day commands |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System map, tenancy, data flow, caching |
| [`docs/API.md`](./docs/API.md) | Endpoint inventory for the school platform |
| [`docs/SUPERADMIN.md`](./docs/SUPERADMIN.md) | The console: access, roles, surfaces, API, runbook |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Production runbook for both apps |
| [`apps/superadmin/README.md`](./apps/superadmin/README.md) | Console implementation reference — why each surface is built the way it is |

## Layout

```
educore-africa/
├── apps/
│   ├── web/                 # School platform (:3000)
│   └── superadmin/          # Super Admin Console (:3001)
├── packages/
│   └── database/            # Prisma schema, migrations, seeds, shared promo rules
├── design/                  # Claude Design canvases (.dc.html artboards)
├── docs/                    # The guides above
└── .github/workflows/       # ci.yml · deploy.yml (web) · deploy-superadmin.yml
```

## Commands

Run from the repo root. Turbo fans them out across both apps.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start both apps |
| `pnpm dev:web` / `pnpm dev:superadmin` | Start one |
| `pnpm build` | Production build of everything |
| `pnpm lint` / `pnpm check-types` | ESLint / `tsc --noEmit` across the workspace |
| `pnpm db:migrate` | Apply pending migrations locally |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm db:seed` | Demo school, then the console seed |
| `pnpm db:studio` | Prisma Studio |
| `pnpm docker:up` / `:down` | Local Postgres + Redis |

Per-app tests:

```bash
pnpm --filter web test               # vitest
pnpm --filter superadmin test        # vitest
pnpm --filter superadmin test:sa10   # end-to-end; needs a running server
```

The console's end-to-end suites are listed in
[`docs/SUPERADMIN.md`](./docs/SUPERADMIN.md#checks).

## Stack

Next.js 14 (app router) · React 18 · TypeScript · Tailwind + shadcn/ui ·
Prisma 5 + Postgres 15 · Redis 7 · BullMQ · TanStack Query · Auth.js v5 ·
Recharts · Anthropic Claude · Paystack + Flutterwave · Africa's Talking (SMS +
USSD) · Meta WhatsApp Cloud API · Resend · AWS S3 · Leaflet · Sentry · Vitest.

## Conventions

- **kebab-case filenames** throughout.
- **British spelling** in user-facing copy; Nigerian naira (`₦`) formatting via
  `formatCurrency`.
- **Never fabricate a figure.** An unconfigured integration reads "Not
  checked", not green; an unimplemented queue says so; an AI score is
  arithmetic and the model only writes the prose around it. Every surface
  labels which of the two it is showing.
- **Audit logging is explicit**, never middleware — the recorded verb should
  reflect intent.
- One migration history in `packages/database/prisma/migrations`, shared by
  both apps. Write migrations by hand and apply with `migrate deploy`;
  `prisma migrate dev` misbehaves under `pnpm exec` in this workspace.
