# Architecture

EduCore Africa is a multi-tenant Next.js app for K-12 schools. One installation
serves many schools (`schoolId` is the tenant column on nearly every model);
SUPER_ADMIN sees across all of them, every other role is school-scoped.

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
| Tests | Vitest |

## Tenancy and authorisation

- **`User.schoolId`** is the tenant key. Nullable only for `SUPER_ADMIN`.
- Every API route starts with `await auth()` and rejects when `schoolId` is
  missing for everyone except SUPER_ADMIN.
- Per-role gating is hard-coded — see [`lib/permissions.ts`](../apps/web/lib/permissions.ts).
  The matrix at `/dashboard/settings/roles` documents what each role can do
  but does **not** enforce; route handlers are the enforcement layer.
- Custom roles (RBAC tables) are deliberately out of scope. Adding them is a
  schema upgrade.

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

Surfaces map 1:1 to the P0X prompts that built them. Each one has a
`/memory/project_pXX_*.md` file with non-obvious wiring decisions, called out
here as `[memory]`.

| Surface | Routes | Memory |
| --- | --- | --- |
| Onboarding & student wizard | `/onboarding`, `/dashboard/students` | [P03 wizard](../memory/project_p03_wizard_steps.md), [P03 admission #](../memory/project_p03_admission_number.md) |
| Staff, attendance, payroll | `/dashboard/staff`, `/dashboard/attendance` | [P04 AI model](../memory/project_p04_ai_model.md), [P04 payslip PDF](../memory/project_p04_payslip_format.md), [P05 worker](../memory/project_p05_worker.md) |
| Grades & report cards | `/dashboard/grades`, `/report-cards/[token]` | [P06 grades](../memory/project_p06_grades.md) |
| Finance | `/dashboard/finance`, `/pay/[invoiceId]` | [P07 finance](../memory/project_p07_finance.md) |
| AI suite (Ask EduCore, risk, insights) | `/dashboard/ai` | [P08 AI](../memory/project_p08_ai_intelligence.md) |
| Communications | `/dashboard/messages`, `/dashboard/announcements`, `/dashboard/communications/*`, public `/notice-board` | [P09 comms](../memory/project_p09_communication_hub.md) |
| Timetable, assignments, lessons, resources | `/dashboard/timetable`, `/dashboard/assignments`, `/dashboard/lessons`, `/dashboard/resources` | [P10 LMS](../memory/project_p10_lms.md) |
| Library, hostel, transport, visitors | `/dashboard/library`, `/dashboard/hostel`, `/dashboard/transport`, `/dashboard/visitors` | [P11 ops](../memory/project_p11_operations.md) |
| Executive dashboard, analytics, audit, network | `/dashboard`, `/dashboard/analytics`, `/dashboard/settings/audit-log`, `/network-dashboard` | [P12 admin](../memory/project_p12_admin.md) |
| USSD, PWA, tests, deploy | `/api/ussd`, PWA shell, `__tests__/`, Dockerfile, CI | (P13 — this prompt) |

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
before/after captures are intentional. See [P12 memory](../memory/project_p12_admin.md).
