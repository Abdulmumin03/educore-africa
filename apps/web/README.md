# EduCore Africa — School Platform

The school-facing application: one installation, many tenants. Admins,
teachers, bursars, form masters and parents all live here, and everything they
see is scoped by `schoolId`.

The internal staff console is a **separate** app — [`apps/superadmin`](../superadmin)
on port 3001. Nothing in this app may import from it, or query the
`super_admin_*` tables.

- Dev URL: <http://localhost:3000>
- Prisma models come from the shared `@educore/database` package

## Running it

```bash
pnpm --filter web dev      # or `pnpm dev:web` from the repo root
```

`pnpm dev` at the repo root starts this app **and** the console.

Queued work needs a second process. Without it, jobs are written to Redis and
never dispatched:

```bash
pnpm --filter web worker
```

That covers attendance SMS, scheduled announcements, exeat OTPs — everything
with a producer under `lib/queues/`.

## Surfaces

| Area | Route |
| --- | --- |
| Public site, signup, onboarding | `/`, `/auth/*`, `/onboard` |
| Dashboard shell | `/dashboard` |
| Students, staff, attendance, payroll | `/dashboard/students`, `/staff`, `/attendance` |
| Grades, report cards, midterms | `/dashboard/grades`, public `/report-cards/[token]` |
| Finance and fee collection | `/dashboard/finance`, public `/pay/[invoiceId]` |
| AI suite — Ask EduCore, risk, insights | `/dashboard/ai` |
| Communications, announcements | `/dashboard/messages`, public `/notice-board` |
| Timetable, assignments, lessons, resources | `/dashboard/timetable`, `/assignments`, `/lessons`, `/resources` |
| Library, hostel, transport, visitors | `/dashboard/library`, `/hostel`, `/transport`, `/visitors` |
| Analytics, audit log, multi-school network | `/dashboard/analytics`, `/settings/audit-log`, `/network-dashboard` |
| Feature-phone access | `POST /api/ussd` |

## Checks

```bash
pnpm --filter web lint
pnpm --filter web exec tsc --noEmit
pnpm --filter web test           # vitest
pnpm --filter web build
```

## Documentation

| Doc | What it covers |
| --- | --- |
| [`docs/README.md`](../../docs/README.md) | Setup, environment variables, commands |
| [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) | Tenancy, data flow, caching, audit logging |
| [`docs/API.md`](../../docs/API.md) | Endpoint inventory for this app |
| [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) | Production runbook |
