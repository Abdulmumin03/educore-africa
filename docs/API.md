# API reference

The **school platform** exposes ~90 HTTP routes under `apps/web/app/api/**`.
This file is a **navigational index** — for the actual request/response shape
of any endpoint, open the route file in `app/api/<surface>/route.ts`; the Zod
schema and response payload are right at the top.

> The Super Admin Console is a separate application with its own 114 routes,
> its own auth conventions and its own rate limits. Its inventory is in
> [`SUPERADMIN.md § 8`](./SUPERADMIN.md#8-api-inventory) — nothing on this page
> applies to it.

## Conventions

Every authenticated route opens with the same five lines:

```ts
const session = await auth()
if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
if (!session.user.schoolId)
  return NextResponse.json({ error: "No school context" }, { status: 400 })
if (!ALLOWED_ROLES.includes(session.user.role))
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
```

Standard responses:

| Status | Body | When |
| --- | --- | --- |
| 200 | resource payload | success |
| 201 | `{ ok: true, id }` | create |
| 400 | `{ error: "No school context" }` | session missing schoolId |
| 401 | `{ error: "Unauthorized" }` | no session |
| 403 | `{ error: "Forbidden" }` | role not permitted |
| 404 | `{ error: "Not found" }` | resource missing |
| 409 | `{ error: "<reason>" }` | conflict (unique, state-machine, etc.) |
| 422 | `{ error: "Validation failed", details }` | Zod parse failed |
| 502 | `{ error: "<upstream>" }` | external API failure (Anthropic, SMS, etc.) |
| 503 | service-unavailable | external service unconfigured (S3, AI without key) |

Webhooks (no session): `/api/finance/webhook/paystack`, `/api/ussd`,
`/api/cron/*`. These have their own verification (HMAC, secret header, etc.).

Two routes are public by design: `GET /api/health` (probes and the container
HEALTHCHECK) and `POST /api/promo` (validates a promo code during school
signup, before any account exists). Both are listed in `PUBLIC_PREFIXES` in
`apps/web/middleware.ts`.

## Endpoint inventory

Grouped by surface. Methods listed per route; `[id]` is a route param.

### Identity & users (P03, P12)

- `GET POST /api/students`, `GET PATCH DELETE /api/students/[id]`
- `POST /api/students/bulk-sms` — group SMS to a class's parents
- `GET POST /api/users`, `PATCH /api/users/[id]` — invite, suspend, reset, role change
- `POST /api/users/import`, `GET /api/users/import/template`
- `POST /api/me/notification-preferences`

### Onboarding (P03)

- `POST /api/onboarding/start`
- `POST /api/onboarding/step/[n]`
- `POST /api/onboarding/complete`

### Attendance (P05)

- `GET POST /api/attendance` — list + bulk mark
- `GET /api/attendance/my-sections`, `/roster`, `/heatmap`, `/class-report`
- `POST /api/attendance/qr-checkin`
- `GET /api/attendance/not-marked-today`
- `POST /api/attendance/contact-parent`

### Staff & payroll (P04)

- `GET POST /api/staff/[id]/assignments`
- `GET /api/staff/[id]/payslips/[payslipId]/pdf`
- `/api/staff/leave/*`, `/api/staff/payroll/*`
- `POST /api/ai/generate-appraisal`
- `POST /api/ai/generate-principal-comment`
- `POST /api/ai/training-suggestions`

### Grades & report cards (P06)

- `GET POST /api/grades/*`
- `POST /api/ai/generate-remark`
- `GET /api/report-cards/*`, `/api/report-cards/[id]/share`, `/api/report-cards/[token]` (public)

### Finance (P07)

- `GET POST /api/finance/invoices`, `GET /api/finance/invoices/[id]/pdf`
- `POST /api/finance/payments` — manual record
- `POST /api/finance/webhook/paystack` — webhook (HMAC-verified)
- `GET /api/finance/discounts`, `/api/finance/reports/*`
- `POST /api/ai/payment-risk`

### AI suite (P08)

- `POST /api/ai/ask` + `/api/ai/ask/[conversationId]` — Ask EduCore (tool use)
- `POST /api/ai/at-risk`, `/api/ai/at-risk/run` — risk scoring
- `POST /api/ai/attendance-risk`
- `POST /api/ai/school-insights` — 6h Redis-cached
- `POST /api/ai/questions/generate`, `/save`, `/export` — question bank
- `POST /api/ai/timetable/generate`, `/save` — timetable generator

### Communications (P09)

- `GET POST /api/announcements`, `GET PATCH DELETE /api/announcements/[id]`
- `POST /api/announcements/[id]/read`, `GET /api/announcements/[id]/reads`
- `GET POST /api/messages`, `GET /api/messages/[conversationId]`, `/recipients`, `POST /api/messages/translate`
- `POST /api/notifications/sms`, `POST /api/notifications/whatsapp`
- `POST /api/communications/emergency`, `GET /api/communications/analytics`
- `POST /api/cron/announcements/dispatch-scheduled`
- `GET /api/notifications`, `POST /api/notifications/mark-read`

### LMS — TT, assignments, lessons, resources (P10)

- `GET POST /api/timetable`, `DELETE /api/timetable/[id]`, `POST /api/timetable/swap`, `GET /api/timetable/pdf`
- `GET POST /api/assignments`, `GET PATCH DELETE /api/assignments/[id]`
- `GET /api/assignments/[id]/submissions`, `POST /api/assignments/[id]/submit`
- `PATCH /api/assignments/[id]/submissions/[sid]`, `POST /api/assignments/[id]/submissions/bulk-grade`
- `GET POST /api/lessons`, `GET PATCH DELETE /api/lessons/[id]`, `POST /api/lessons/[id]/duplicate`
- `POST /api/ai/generate-lesson-plan`
- `GET POST /api/resources`, `DELETE /api/resources/[id]`, `POST /api/resources/[id]/download`
- `POST /api/ai/book-recommendations`

### Operations — library, hostel, transport, visitors (P11)

- **Library**: `GET POST /api/library/books`, `GET PATCH DELETE /api/library/books/[id]`,
  `POST /api/library/books/import`, `GET /api/library/books/template`,
  `GET POST /api/library/transactions`, `GET /api/library/overdue`, `GET /api/library/analytics`
- **Hostel**: `GET POST /api/hostel/hostels`, `PATCH DELETE /api/hostel/hostels/[id]`,
  `GET POST /api/hostel/rooms`, `PATCH DELETE /api/hostel/rooms/[id]`,
  `GET POST /api/hostel/dorms`, `DELETE /api/hostel/dorms/[id]`,
  `POST /api/hostel/assignments`, `DELETE /api/hostel/assignments/[id]`,
  `GET POST /api/hostel/exeat`, `PATCH /api/hostel/exeat/[id]`,
  `GET POST /api/hostel/incidents`, `GET POST /api/hostel/maintenance`, `PATCH /api/hostel/maintenance/[id]`
- **Transport**: `GET POST /api/transport/routes`, `PATCH DELETE /api/transport/routes/[id]`,
  `POST /api/transport/routes/[id]/stops`, `GET POST /api/transport/assignments`,
  `DELETE /api/transport/assignments/[id]`, `POST /api/transport/update-location`,
  `GET /api/transport/live-locations`, `GET POST /api/transport/board`
- **Visitors**: `GET POST /api/visitors`, `PATCH /api/visitors/[id]/checkout`,
  `GET /api/visitors/[id]/badge`, `GET /api/visitors/export`

### Admin — dashboard, analytics, audit, network (P12)

- `GET /api/dashboard/exec` — 5-min Redis-cached rollup
- `GET /api/analytics/[type]` — dispatcher (academic | attendance | financial | enrollment | staff | predictions)
- `GET /api/audit-log`, `GET /api/audit-log/export`
- `GET /api/network/summary`, `GET /api/network/consolidated-finance`, `POST /api/network/broadcast`

### Infra (P13)

- `POST /api/ussd` — Africa's Talking webhook (form-encoded)
- `GET /api/ussd` — verification stub
- `GET /api/health` — Postgres + Redis ping (public)
- `POST /api/promo` — validate a promo code at signup (public)
- `POST /api/impersonation/accept`, `POST /api/impersonation/exit` — read-only
  console grant; see [ARCHITECTURE.md](./ARCHITECTURE.md#read-only-impersonation-visit-school)
- `POST /api/upload/presign` — S3 presigned PUT URL
- `GET POST /api/school/notifications/test`

## Webhook authentication

| Webhook | Verification |
| --- | --- |
| `/api/finance/webhook/paystack` | HMAC SHA-512 of raw body with `PAYSTACK_SECRET_KEY` (`x-paystack-signature` header) |
| `/api/ussd` | Africa's Talking IP allow-list (not enforced in app code; rely on platform firewall in prod) |
| `/api/cron/*` | `Authorization: Bearer <CRON_SECRET>` header |

## Tool surfaces

The Ask EduCore AI uses Anthropic tool use rather than text-to-SQL. Tool
definitions live at `apps/web/lib/ai/ask-tools.ts`; the header comment there
explains why tool use beats text-to-SQL for this workload.
