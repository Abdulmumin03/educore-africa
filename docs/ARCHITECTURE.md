# Architecture

EduCore Africa is a multi-tenant platform for K-12 schools. One installation
serves many schools (`schoolId` is the tenant column on nearly every model);
every school-facing role is scoped to its own tenant.

## Two applications, one database

```
        ┌───────────────────────┐        ┌───────────────────────┐
        │   apps/web  :3000     │        │ apps/superadmin :3001 │
        │   School platform     │        │  Super Admin Console  │
        │                       │        │                       │
        │  schools, teachers,   │        │  EduCore Africa staff │
        │  bursars, parents     │        │  only — reads across  │
        │  WHERE schoolId = …   │        │  EVERY tenant         │
        └───────────┬───────────┘        └───────────┬───────────┘
                    │                                │
                    │   ┌────────────────────────┐   │
                    └──►│  packages/database     │◄──┘
                        │  one Prisma schema     │
                        │  one migration history │
                        └───────────┬────────────┘
                                    ▼
                              Postgres 15
```

They share `packages/database` and **nothing else**:

- `apps/web` never imports from `apps/superadmin`, and never queries the
  `super_admin_*` tables.
- The console has its own JWT secret, cookie name, session table, IP
  allowlist, audit trail and rate limits. A stolen school session cannot be
  replayed against it.
- Both deploy independently, from separate Dockerfiles and separate workflows.

The console reaches into the school app in exactly four places, all of them in
`apps/web`: the read-only impersonation endpoints, the platform-notice banner,
promo validation at signup, and `/api/health` sitting outside the auth wall.

Everything below describes the **school platform** unless it says otherwise.
The console is documented in [`SUPERADMIN.md`](./SUPERADMIN.md).

## Stack

| Layer | Tech |
| --- | --- |
| Runtime | Node 20 |
| App framework | Next.js 14 (app router, React 18) |
| Database | Postgres 15 via Prisma 5 |
| Cache + sessions + queues | Redis 7 |
| Background jobs | BullMQ (`pnpm worker`) |
| Data fetching (client) | TanStack Query |
| UI | shadcn/ui + Tailwind |
| Auth | Auth.js (NextAuth) v5 — credentials + Google OAuth |
| Files | AWS S3 via presigned URLs |
| Payments | Paystack (Nigeria-first, supports MoMo + cards) |
| SMS / USSD | Africa's Talking |
| WhatsApp | Meta Cloud API |
| Email | Resend |
| Maps | Leaflet + OpenStreetMap |
| AI | Anthropic Claude (Sonnet for routine text, Opus for high-stakes scoring) |
| PWA | next-pwa (Workbox service worker) |
| Error monitoring | Sentry |
| Tests | Vitest, plus HTTP smoke suites for the console |

Console-only additions: **SSE** for live service status and streamed AI
output, **ExcelJS** + **Papa Parse** + **Playwright/Chromium** for report
exports, **otpauth** + **qrcode** for TOTP, and a Redis sorted-set rate
limiter. It does **not** use TanStack Query, BullMQ, the PWA service worker,
or Auth.js's OAuth providers.

## Tenancy and authorisation

- **`User.schoolId`** is the tenant key. Nullable only for `SUPER_ADMIN`.
- Every API route starts with `await auth()` and rejects when `schoolId` is
  missing for everyone except SUPER_ADMIN.
- Per-role gating is hard-coded — see [`lib/permissions.ts`](../apps/web/lib/permissions.ts).
  The matrix at `/dashboard/settings/roles` documents what each role can do
  but does **not** enforce; route handlers are the enforcement layer.
- Custom roles (RBAC tables) are deliberately out of scope. Adding them is a
  schema upgrade.

The console has a **separate** identity system — `SuperAdminUser`,
`SuperAdminSession`, seven `SuperAdminRole` values, and its own read-only
capability matrix in `apps/superadmin/lib/permissions.ts`. Console roles are
code, not database rows, so a compromised database cannot grant itself console
powers. There is no path from a school `User` to a console session.

## High-level module map

```
                     ┌─────────────────────────────────┐
                     │           Browser               │
                     │  PWA + TanStack Query + Charts  │
                     └────────────┬────────────────────┘
                                  │ HTTPS
              ┌───────────────────┴────────────────────┐
              │             Next.js 14 (Node)          │
              │  app router routes + RSC + Server Acts │
              │                                        │
              │  lib/auth.ts ◄── all routes start here │
              │  lib/db.ts (Prisma singleton)          │
              │  lib/redis.ts                          │
              │  lib/ai.ts ◄── generateJson() helper   │
              │  lib/audit.ts (explicit logAudit calls)│
              │  lib/cache.ts (Redis-backed memo)      │
              │  lib/sms.ts (Africa's Talking)         │
              │  lib/whatsapp.ts (Meta Cloud)          │
              │  lib/paystack.ts                       │
              │  lib/queues/* (BullMQ producers)       │
              └─┬──────────┬──────────┬──────────┬─────┘
                │          │          │          │
            ┌───▼──┐  ┌────▼───┐  ┌───▼────┐ ┌───▼──┐
            │  Pg  │  │ Redis  │  │  S3    │ │ APIs │
            │      │  │        │  │        │ │ AT,  │
            │      │  │        │  │        │ │ Pay- │
            │      │  │        │  │        │ │ stack│
            │      │  │        │  │        │ │ Cld  │
            └──────┘  └───┬────┘  └────────┘ └──────┘
                          │
                ┌─────────▼──────────┐
                │  BullMQ worker     │
                │  pnpm worker       │
                │  (separate proc)   │
                └────────────────────┘
```

## Per-surface tour

Surfaces map 1:1 to the P0X prompts that built them. The "Built by" column
names that phase; its non-obvious wiring decisions are commented at the top of
the `lib/` module the phase introduced.

| Surface | Routes | Built by |
| --- | --- | --- |
| Onboarding & student wizard | `/onboarding`, `/dashboard/students` | P03 |
| Staff, attendance, payroll | `/dashboard/staff`, `/dashboard/attendance` | P04 · P05 |
| Grades & report cards | `/dashboard/grades`, `/report-cards/[token]` | P06 |
| Finance | `/dashboard/finance`, `/pay/[invoiceId]` | P07 |
| AI suite (Ask EduCore, risk, insights) | `/dashboard/ai` | P08 |
| Communications | `/dashboard/messages`, `/dashboard/announcements`, `/dashboard/communications/*`, public `/notice-board` | P09 |
| Timetable, assignments, lessons, resources | `/dashboard/timetable`, `/dashboard/assignments`, `/dashboard/lessons`, `/dashboard/resources` | P10 |
| Library, hostel, transport, visitors | `/dashboard/library`, `/dashboard/hostel`, `/dashboard/transport`, `/dashboard/visitors` | P11 |
| Executive dashboard, analytics, audit, network | `/dashboard`, `/dashboard/analytics`, `/dashboard/settings/audit-log`, `/network-dashboard` | P12 |
| USSD, PWA, tests, deploy | `/api/ussd`, PWA shell, `__tests__/`, Dockerfile, CI | P13 |
| Multi-curriculum, midterms, report templates | `/dashboard/settings/curricula`, `/dashboard/grades/midterm-reports` | P14 · P15 · P16 |

### Super Admin Console (`apps/superadmin`)

Built by the SA-00 … SA-10 series. Full tour in
[`SUPERADMIN.md § 4`](./SUPERADMIN.md#4-what-each-section-does).

| Section | Route | Built by |
| --- | --- | --- |
| Auth, shell, navigation | `/login`, `/mfa`, `/enroll-mfa`, `/console` | SA-01 · SA-03 |
| Command Centre, school directory | `/console`, `/console/schools` | SA-05 |
| Revenue intelligence | `/console/revenue` | SA-06 |
| Analytics, support, users | `/console/analytics`, `/support`, `/users` | SA-07 |
| System health, config, audit, growth | `/console/system`, `/config`, `/audit`, `/growth` | SA-08 |
| AI suite, reports, hardening, deploy | `/console/analytics/reports`, `/api/ai/*` | SA-10 |

## Data flow worth knowing

### Attendance write
1. Teacher marks the roster in `/dashboard/attendance/mark`.
2. `POST /api/attendance` validates + inserts `Attendance` rows.
3. For each ABSENT entry it enqueues a BullMQ `attendance-sms` job.
4. The `pnpm worker` process consumes the job, calls Africa's Talking, writes
   an `SmsLog` row. **Without the worker running, SMS never go out.**
5. If the browser was offline at step 1, the request is queued in IndexedDB
   ([`lib/offline-queue.ts`](../apps/web/lib/offline-queue.ts)) and replayed
   by `SyncManager` when `online` fires.

### Payment
1. Parent hits `/pay/[invoiceId]`, redirects to Paystack.
2. Paystack POSTs `charge.success` to `/api/finance/webhook/paystack`.
3. Signature is verified (`lib/paystack.ts → verifyWebhookSignature`).
4. Idempotent on `payment.reference` — replays are no-ops.
5. Invoice status moves to `PAID` (or `PARTIAL`), parent gets receipt SMS.

### Transport GPS
1. Driver app posts to `/api/transport/update-location` every 30s.
2. **Dual-write**: Redis `bus:route:<id>` with 90s TTL + a durable
   `BusTracking` row.
3. **Side effects** inline in the same handler (never throw): geofence check
   (>500m deviation → admin notification), bus-near-stop SMS (≤2km → parent
   alert with quiet-hour gate), all dedup'd via AuditLog rows.
4. `/api/transport/live-locations` reads via `MGET` from Redis first, falls
   back to the latest `BusTracking` per route when the cache is cold.

### USSD (parent feature-phone access)
1. Parent dials `*123*<schoolCode>#` on a feature phone.
2. Africa's Talking POSTs to `/api/ussd` with `sessionId`, `phoneNumber`,
   `serviceCode`, `text`.
3. `handleUssdTurn` parses `text` (the full `*`-delimited input chain) and
   routes through a 4-leaf menu (fees / results / attendance / contact).
4. School context is cached in Redis by `sessionId` (10-min TTL) to skip
   per-turn DB lookups.

### Read-only impersonation ("Visit school")

1. A console operator clicks *Visit school* on a school profile.
2. `POST /api/schools/[id]/impersonate` (console) mints a short-lived,
   single-use token and records the grant.
3. The operator lands on `apps/web` carrying that token, which
   `POST /api/impersonation/accept` exchanges for an `educore.impersonation`
   cookie. The token never survives into the redirect target.
4. Every page renders with a banner naming the school and saying **read-only**.
   `apps/web/middleware.ts` refuses POST / PUT / PATCH / DELETE with a 403 for
   the whole session.
5. `POST /api/impersonation/exit` is the one write the viewer may make.
   Revoking the grant from the console takes effect on the next request.

It is a **view, not a login**: no school `User` session is created, so nothing
the operator does can be attributed to a school account.

## Caching layers

| Layer | TTL | Key shape | Lives in |
| --- | --- | --- | --- |
| Dashboard exec rollup | 5 min | `dashboard:exec:<schoolId>` | [`lib/cache.ts`](../apps/web/lib/cache.ts) |
| School settings | 1 h | `school:settings:<schoolId>` | `lib/cache.ts` |
| AI insights | 6 h | `ai:insights:<schoolId>:<termId>` | `/api/ai/school-insights/route.ts` |
| AI student remarks | 7 d | `ai:remark:<studentId>:<termId>` | (P08) |
| USSD session school context | 10 m | `ussd:<sessionId>` | `lib/ussd.ts` |
| Bus live position | 90 s | `bus:route:<id>` | `lib/transport-helpers.ts` |
| PWA runtime cache (NetworkFirst) | 10 m | API responses | service worker, [`next.config.mjs`](../apps/web/next.config.mjs) |

Console caches use a `sa:` Redis key prefix so the two apps cannot collide:

| Layer | TTL | Key shape |
| --- | --- | --- |
| Platform metrics rollup | 5 min | `sa:platform:metrics` |
| AI business snapshot | 6 h | `sa:platform:ai-snapshot` |
| Retention insights | 24 h | `sa:ai:retention` |
| Service status probes | 60 s | `sa:services:*` |
| Per-user IP allowlist | 5 min | `sa:allowlist:<userId>` |
| API latency samples | 48 h | `sa:apiperf:*` (capped list, 500 samples) |
| Rate-limit windows | 1 min | `sa:rate:*` (sorted set) |
| Ad-hoc export files | 30 min | `sa:export:file:<jobId>` |
| Scheduled report files | 7 d | `sa:report:file:<runId>` (only when no S3 bucket) |

Write paths that mutate cached data should call `invalidate(cacheKey.X(id))`
from [`lib/cache.ts`](../apps/web/lib/cache.ts) — don't reach for `redis.del`
directly in new code.

## When to add an audit log call

Anywhere a privileged user mutates compliance-relevant state: role changes,
grade overrides, fee writes, exeat approvals, suspensions. Pattern:

```ts
import { logAudit, snapshot } from "@/lib/audit"

const before = snapshot(row, ["status", "approvedById"] as const)
await prisma.exeat.update({ where: { id }, data: { status: "APPROVED" } })
await logAudit({
  schoolId, userId,
  action: "exeat.approve",
  entityType: "Exeat",
  entityId: id,
  before,
  after: { status: "APPROVED" },
})
```

It's deliberately not middleware — explicit calls so the action name and the
before/after captures are intentional. See P12 memory.
