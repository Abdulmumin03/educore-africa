# Super Admin Console

The internal operations console for EduCore Africa staff — `apps/superadmin`,
served on **port 3001** at `/console`. It is a separate application from the
school platform and it is not a "super admin area" bolted onto it.

This file is the **orientation and operations guide**: what the console is,
who can get into it, what each section does, the full endpoint inventory, and
the runbook for the things you will actually have to do. For *why* a given
surface is built the way it is — the trade-offs, the things deliberately not
built — read [`apps/superadmin/README.md`](../apps/superadmin/README.md),
which is the implementation reference.

---

## 1. What it is, and what it is not

| | School platform (`apps/web`) | Super Admin Console (`apps/superadmin`) |
| --- | --- | --- |
| Port | 3000 | 3001 |
| Audience | one school at a time | EduCore Africa staff |
| Data scope | `WHERE schoolId = …` on everything | across every tenant |
| Auth | Auth.js credentials + Google | credentials + **mandatory TOTP** |
| Session cookie | `authjs.session-token` | `educore-sa.session-token` |
| JWT secret | `NEXTAUTH_SECRET` | `SUPERADMIN_SECRET` (must differ) |
| Users table | `users` | `super_admin_users` |
| Network | public | IP-allowlisted, twice |

**The boundary is the point.** `apps/web` must never import from
`apps/superadmin`, and must never query the `super_admin_*` tables. The
console reaches into the school app in exactly four places, all of them small
and all of them in `apps/web`:

- `POST /api/impersonation/*` — accepts a **read-only** view grant
- `components/shared/platform-banner.tsx` — renders platform notices
- `POST /api/promo` — validates a promo code at school signup
- `GET /api/health` — moved outside the auth wall so probes can reach it

Everything else the two share, they share through `packages/database`.

## 2. Getting in

### Create an account

```bash
pnpm --filter superadmin admin:create -- \
  --email you@educoreafrica.com \
  --name "Your Name" \
  --password "…" \
  --role SUPER_ADMIN
```

Add `--totp` to pre-seed the authenticator secret and print an `otpauth://`
URI. Without it, the first sign-in redirects to `/enroll-mfa` and walks
through the QR code — **an account with no TOTP cannot reach the console at
all.** Re-running for an existing email resets that password.

The seed creates seven accounts, one per role, with
`admin@educoreafrica.com` as the SUPER_ADMIN (see §7).

### Sign-in is two legs

The password leg **never** mints a session:

1. `POST /api/auth/signin` — password, lockout counter, IP check → a
   5-minute HMAC-signed challenge cookie and a `next` destination.
2. `POST /api/auth/verify-mfa` — authenticator code or a single-use backup
   code → the session.

Five consecutive failures (password *or* code, counted together) lock the
account for 15 minutes and return `423`. The counter lives on the user row
rather than in Redis, so flushing the cache cannot hand an attacker a fresh
allowance.

Sessions have a **30-minute idle window** that slides forward on activity,
under a hard **8-hour ceiling**, and a maximum of **two concurrent sessions**
per user — a third revokes the least recently active one. Revocation takes
effect on the next request, because the guard re-reads the session row every
time rather than trusting the JWT.

### The IP allowlist is enforced twice

`ALLOWED_IPS` is a comma-separated list of exact addresses (`102.89.1.4`) or
dotted prefixes (`102.89.`). Blank means **allow all in development, deny all
in production**. `*` is an explicit development bypass.

- `middleware.ts` (edge) checks the global list on unauthenticated requests.
- `lib/session-guard.ts` (Node) checks the global list **and** the user's own
  `allowedIPs` on every authenticated request, cached in Redis for 5 minutes.

Both are needed: the per-user list requires a database, and Prisma does not
run on the edge. In production the console also sits behind a Cloudflare IP
rule — two layers, because a Cloudflare rule can be edited by anyone with
dashboard access and the app's list cannot.

`GET /api/health` is exempt from both. It has to be: the container runtime,
the load balancer and the deploy smoke test all call it, and none of them are
on the office network.

> **Locked out of your own dev server?** Leave `ALLOWED_IPS` blank locally.
> With no proxy in front, requests carry no `x-forwarded-for`, the client IP
> resolves to `unknown`, and any populated list will refuse you.

## 3. Roles

Seven roles, defined as a fixed matrix in `lib/permissions.ts` — **code, not
database rows**, so a compromised database cannot grant itself console
powers. The matrix is read-only; route handlers and page guards are the
enforcement.

| Role | Sections |
| --- | --- |
| `SUPER_ADMIN` | everything, including other console accounts |
| `BUSINESS_ADMIN` | command centre · schools · revenue · analytics · growth · support |
| `FINANCE_ADMIN` | command centre · revenue · schools · analytics |
| `SALES_ADMIN` | command centre · growth · schools · analytics |
| `SUPPORT_ADMIN` | command centre · support · schools · users |
| `ANALYTICS_ADMIN` | command centre · analytics · revenue · growth |
| `ENGINEERING_ADMIN` | command centre · system · audit · config · schools |

A role that cannot reach a section gets a 307 away from the page and a 403
from the API. Sensitive actions narrow further than the section grant —
running churn scoring, for instance, needs BUSINESS_ADMIN, SALES_ADMIN or
SUPPORT_ADMIN even though several roles can read the scores.

## 4. What each section does

### Command Centre — `/console`

Six KPIs with sparklines and month-on-month trends, a 12-month growth chart,
subscription mix, a state tile-grid choropleth, revenue by plan, an action
list, a live activity feed, **This week's opportunities** (AI growth
recommendations) and the **weekly business snapshot** (streamed).

### Schools — `/console/schools`

Cross-tenant directory: plan, status, students, MRR, last active, a health
score and a **churn-risk badge**. Each school has a profile with usage,
subscription history, notes, activity and a **read-only impersonation** grant
— "Visit school" opens the school app with a banner and every write blocked
with a 403. It is a view, not a login.

### Revenue — `/console/revenue`

Five KPIs — MRR, ARR, revenue for the period, average per school and net
revenue retention — plus revenue by period and by state, a churn view,
transactions with export, failed payments with retry / reminder / resolve,
refunds, and cohort retention. Money-moving actions are gated and audited; a
refund records who authorised it.

### Analytics — `/console/analytics`

Six tabs dispatched from `?tab=`, so only the selected tab's queries run:
feature adoption, cohort retention, growth funnel, geographic, NPS &
satisfaction, and API performance. The funnel is **strictly nested** — each
stage intersects the one above it, because counting stages independently once
let "paid" exceed "onboarded", which is not a funnel. Also home to the
**report builder** (§6).

### Support — `/console/support`

Three-panel ticket console with SLA clocks, plus an SLA dashboard (`/sla`),
school health (`/health`) and `/broadcast`. Only a **public** reply stamps `firstResponseAt`
and moves a ticket OPEN → IN_PROGRESS; an internal note does neither.
"Suggest triage" proposes a category, priority and draft reply — and applies
nothing until an agent presses the button.

### Users — `/console/users`

Cross-tenant search over school users. "Lock" deactivates and drops every
session. "Reset password" issues a one-time temporary password — it cannot
force rotation (no must-change flag exists) and the response says so.
`/staff` manages console accounts (SUPER_ADMIN only); `/anomalies` groups
repeated auth failures.

### System — `/console/system`

Nine-service status grid (SSE, refreshed every 30s), API error monitor with
spike detection, job-queue monitor, latency percentiles and resource gauges,
plus `/feature-flags`. Unconfigured services read **"Not checked"** with no
uptime figure — never green. Four of the five specced queues report "not
implemented" with the reason, because only `attendance` has a producer.

### Config — `/console/config`

Plans and pricing, promo codes, email and SMS templates (versioned, with
preview / test-send / rollback) and global announcements. Re-pricing a plan
warns that existing subscribers are **not** re-priced.

### Audit — `/console/audit`

Console audit log with signed-PDF export, school data-access log, an NDPR
compliance dashboard and data-deletion requests. Erasure **anonymises** rather
than deletes — attendance, grades and invoices hold foreign keys — and the
non-nullable `dateOfBirth` is coarsened to 1 January of the same year. The PDF
carries a SHA-256 digest and states on every page that this is not a
cryptographic signature.

### Growth — `/console/growth`

Drag-to-move Kanban lead pipeline, trial management with conversion scores,
the referral programme, and **at-risk schools** (churn scoring).

## 5. AI surfaces

One rule: **anything that is a number is arithmetic; Claude only writes the
prose around it.** Every panel labels which of the two it is showing, and each
has a computed fallback, so an unset `ANTHROPIC_API_KEY` degrades the wording
rather than emptying the page.

| Surface | Endpoint | Appears in |
| --- | --- | --- |
| Weekly business snapshot | `GET /api/ai/business-snapshot`, `…/stream` | Command Centre |
| Growth recommendations | `GET POST /api/ai/growth-recommendations` | Command Centre |
| Churn risk | `GET POST /api/ai/churn-risk` | school directory badge, Growth → At-risk |
| Ticket triage | `POST /api/ai/categorise-ticket` | Support → ticket panel |
| Retention insights | `GET /api/ai/retention-insights` | Analytics |
| Trial conversion score | `GET /api/ai/trial-conversion-score` | Growth → Trials |
| Revenue forecast | `GET /api/ai/revenue-forecast` | Revenue |

**Churn risk** is a weighted sum over four observed signals — silence since
last login (40), overdue payment (25), shallow module adoption (20), recent
tickets (15) — each capped before weighting. ≥70 is CRITICAL, ≥45 HIGH, ≥22
MEDIUM. A school nobody has ever signed into scores `daysSinceLogin: 999`, not
0; treating "never" as "today" would hide exactly the accounts the score
exists to find. Claude narrates the worst 25; the rest carry a computed
verdict and every row says which. Only HIGH and CRITICAL count toward MRR at
risk.

**Triage suggests and never applies.** A model that could set CRITICAL
unattended would be starting an SLA clock unattended, and that clock is what
the support board is measured on.

Churn scoring and growth recommendations run weekly from
`/api/cron/churn-risk` and `/api/cron/growth-recommendations`; both also have
a manual "run now" button.

## 6. Reports and exports

`/console/analytics/reports` builds a report in five steps — source, fields,
filters, sort and limit, schedule — with **Preview**, **Save** and **Export
Now**.

`lib/reports.ts` is the query engine *and* the security boundary. Nothing from
the request ever reaches SQL: every column and every filter names a key in a
hand-written catalogue that maps to a fixed SQL fragment. Six sources
(schools, revenue, users, tickets, usage, feature adoption), typed operators
per field, 20,000 rows maximum. A filter that does not typecheck **rejects the
whole report** rather than being quietly dropped — a dropped filter returns
*more* rows than were asked for, which is the dangerous direction.

| Format | Built with | Notes |
| --- | --- | --- |
| `xlsx` | ExcelJS | navy header, striped rows, autofilter, frozen header row, `₦` and `dd/mm/yyyy` formats, an "About" sheet recording any truncation |
| `csv` | Papa Parse | column labels as the header; leading `=`, `+`, `@` neutralised |
| `pdf` | Chromium via Playwright | A4 landscape, **light theme** with a cover page and confidentiality footer |
| `html` | — | what a PDF request degrades to |

Where no browser is available the job stores the print-ready HTML instead,
**renames the file to `.html`** and returns the reason. Nothing is ever
labelled a PDF that is not one. The production image installs Debian's
`chromium` and sets `CHROMIUM_PATH`, so the real path runs there.

Scheduled reports run at **06:00 WAT** from `/api/cron/reports`: build the
workbook → S3 with a 7-day presigned URL, or Redis if no bucket is configured
→ email through Resend → write `ReportRunLog`. A run with neither an object
store nor a mail key still succeeds and says both:

```
Stored in Redis for 7 days because no object store is configured.
RESEND_API_KEY is not set, so no email was sent.
```

## 7. Seeds

Three, and they do different jobs:

| Command | What it creates | Safe on production? |
| --- | --- | --- |
| `pnpm --filter @educore/database seed:superadmin` | 7 console accounts, 50 `demo-` schools across 10 states, 6 months of daily metric snapshots, 20 tickets, 30 transactions | the console accounts yes; the demo rows no |
| `pnpm --filter superadmin seed:platform` | message templates, feature flags, the plan catalogue — configuration, not demo data | **yes** — upserts by natural key, never overwrites a deliberate edit |
| `pnpm --filter superadmin seed:demo` | 70 demo schools with users, students, staff, academic records, tickets, NPS | no — `--undo` removes them |

`pnpm db:seed` (or `pnpm prisma db seed`) runs the school seed and then the
console seed.

`seed-superadmin` is additive and idempotent: re-running tops the counts back
up rather than duplicating, and it never deletes a row it did not create. Its
randomness is a fixed-seed PRNG rather than `Math.random`, so two people
seeding the same database see the same dashboard and "is this number right?"
stays answerable. The snapshot series is walked **backwards from today's real
figures**, so history joins up with what the console actually shows. TOTP is
not pre-enrolled.

Set `SEED_SUPERADMIN_PASSWORD` to choose the initial password; it defaults to
`EduCore#Console2026`. **Change it before anything ships.**

## 8. API inventory

114 routes under `apps/superadmin/app/api/**`. Every authenticated route opens
with `requireApiSession(request)`, which validates the session row, applies
both IP allowlists, enforces the 200/min per-user rate limit and records
failures for the error monitor. Role checks use `requireApiRole(user, …)`.

### Auth
`POST /api/auth/signin` · `POST /api/auth/verify-mfa` · `POST /api/auth/logout` ·
`GET /api/auth/me` · `POST /api/auth/totp/enroll` · `POST /api/auth/totp/confirm`

### Metrics and shell
`GET /api/metrics/overview` · `/metrics/growth-trend` · `/metrics/by-state` ·
`/metrics/subscription-mix` · `/activity-feed` · `/alerts` · `/search` ·
`/notifications` · `POST /api/notifications/read`

### Schools
`GET /api/schools` · `/schools/export` · `GET /api/schools/[id]` ·
`/[id]/usage` · `/[id]/activity` · `/[id]/users` · `GET POST /api/schools/[id]/notes` ·
`PATCH /api/schools/[id]/status` · `/[id]/subscription` ·
`POST /api/schools/[id]/impersonate` · `POST /api/impersonation/end` (console side; the school app answers on `/api/impersonation/accept` and `/exit`)

### Revenue
`GET /api/revenue/kpis` · `/by-period` · `/by-state` · `/churn` · `/cohorts` ·
`/transactions` · `/transactions/export` · `/refunds` · `/failed-payments` ·
`POST /api/revenue/failed-payments/[id]/retry` · `/send-reminder` · `/resolve`

### Analytics
`GET /api/analytics/feature-adoption` · `/funnel` · `/geographic` · `/nps`

### Support
`GET POST /api/support/tickets` · `GET /api/support/tickets/[id]` ·
`POST /api/support/tickets/[id]/reply` · `PUT /api/support/tickets/[id]/update` ·
`GET /api/support/sla` · `/at-risk-schools` · `POST /api/broadcast` · `/broadcast/preview`

### Users
`GET /api/users/search` · `/users/anomalies` · `GET /api/users/[id]` ·
`POST /api/users/[id]/lock` · `/users/[id]/reset-password` ·
`GET POST /api/internal-users` · `PATCH DELETE /api/internal-users/[id]`

### System
`GET /api/system/services` · `/services/stream` (SSE) · `/system/health` ·
`/system/errors` · `/system/queues` · `POST /api/system/queues/[name]/retry-failed` ·
`GET /api/system/performance` · `/system/api-performance` ·
`GET POST /api/system/feature-flags` · `PATCH DELETE /api/system/feature-flags/[id]`

### Config
`GET PATCH /api/config/plans` · `GET POST /api/config/promo-codes` ·
`PATCH DELETE /api/config/promo-codes/[id]` · `POST /api/config/promo-codes/validate` ·
`GET POST /api/config/email-templates` · `/sms-templates` (+ `/[id]`) ·
`POST /api/config/templates/[id]/preview` · `/test-send` · `/rollback` ·
`GET POST /api/config/announcements` · `PATCH DELETE /api/config/announcements/[id]`

### Audit and compliance
`GET /api/audit/logs` · `/audit/logs/export` (PDF) · `/audit/data-access` ·
`GET POST /api/compliance/requests` · `PATCH /api/compliance/requests/[id]` ·
`POST /api/compliance/execute-deletion`

### Growth
`GET POST /api/growth/leads` · `PATCH DELETE /api/growth/leads/[id]` ·
`GET /api/growth/trials` · `POST /api/growth/trials/[schoolId]/action` ·
`GET POST /api/growth/referrals` · `PATCH /api/growth/referrals/[id]`

### AI
`GET /api/ai/business-snapshot` · `/business-snapshot/stream` (SSE) ·
`GET POST /api/ai/churn-risk` · `/growth-recommendations` ·
`POST /api/ai/categorise-ticket` · `GET /api/ai/retention-insights` ·
`/trial-conversion-score` · `/revenue-forecast`

### Reports and exports
`GET POST /api/reports` · `GET DELETE /api/reports/[id]` ·
`POST /api/reports/[id]/run` · `POST /api/reports/preview` ·
`GET /api/reports/download/[runId]` · `POST /api/export` ·
`GET /api/export/[jobId]` · `/export/[jobId]/download`

### Unauthenticated
| Route | Verification |
| --- | --- |
| `GET /api/health` | none — public probe by design |
| `POST /api/cron/reports`, `/cron/churn-risk`, `/cron/growth-recommendations` | `Authorization: Bearer $CRON_SECRET`; with the secret unset they refuse **every** caller |
| `/api/internal/ip-blocked` | internal rewrite target for the edge middleware |

## 9. Production hardening

**Rate limits** are Redis sliding windows, enforced in the app rather than
middleware — the edge runtime has no ioredis.

| Surface | Limit | If Redis is unreachable |
| --- | --- | --- |
| `/api/auth/*` | 10/min per IP | **fails closed** — 503 |
| `/api/*` | 200/min per authenticated user | fails open |

Auth fails closed deliberately: a console still accepting unlimited password
attempts because a cache blipped has lost the one thing standing between an
attacker and an unlimited guess rate. Rejected requests are removed from the
window, so a client that backs off recovers on schedule rather than being
punished for retrying. Loopback is exempt **outside production only** — a
limiter that makes the smoke suites unrunnable gets switched off wholesale,
which is worse than one documented carve-out.

**Headers** (`next.config.mjs`): CSP with `default-src 'self'`,
`frame-ancestors 'none'`, `object-src 'none'`, `connect-src 'self'`;
Permissions-Policy; COOP/CORP; `X-Frame-Options: DENY`; nosniff; no
`X-Powered-By`. `script-src` carries `'unsafe-inline'` because Next's own
bootstrap is an inline script, and `'unsafe-eval'` in development only — both
loosenings are commented where they are set. HSTS is **production only**;
sending it from a dev server would pin `localhost` to HTTPS in your browser.

**Error boundaries** are Next's own `error.tsx` (one under `/console`, one at
the root) plus `global-error.tsx` for a failure in the root layout. Each shows
the message and the `digest`, because an operator reporting a problem needs
something to paste. Sentry is not wired into this app and the boundary says
so, rather than implying reporting that does not happen.

**`GET /api/health`** returns `{status, db, redis, version, timestamp,
latencyMs}` — 200 when both backends answer, 503 when either does not, so an
orchestrator can act on the status code without parsing the body.

## 10. Runbook

**Grant someone access.** `admin:create` with the right `--role`, then have
them enrol TOTP on first sign-in. Add their egress IP to `ALLOWED_IPS`, or to
that user's own `allowedIPs` from `/console/users/staff`.

**Someone is locked out.** Locked accounts clear themselves after 15 minutes.
If they have lost their authenticator, they use a backup code; if those are
gone too, a SUPER_ADMIN resets TOTP from `/console/users/staff`, which forces
re-enrolment on the next sign-in.

**Revoke access immediately.** Deactivate the account from
`/console/users/staff` — it drops every live session on the next request,
not at the next expiry.

**Rotate `SUPERADMIN_SECRET`.** It keys both the JWTs and the AES-256-GCM
encryption of TOTP seeds. Rotating it invalidates every session *and* makes
every stored seed undecryptable, so every user must re-enrol. Plan it.

**A service shows "Not checked".** Its credentials are unset. That is the
console refusing to report an unprobed dependency as healthy, not a bug.

**Reports produce HTML instead of PDF.** Chromium is missing. Install it and
point `CHROMIUM_PATH` at the binary, or use the Docker image, which ships it.

**Scheduled reports never run.** `CRON_SECRET` is unset, so `/api/cron/*`
refuses every caller — including your scheduler.

## 11. Checks

```bash
pnpm --filter superadmin check-types
pnpm --filter superadmin lint
pnpm --filter superadmin test          # vitest units
pnpm --filter superadmin build
```

The end-to-end suites need a **running dev server** and the real database.
Each creates and deletes its own throwaway accounts and fixtures, so all of
them are safe to re-run:

| Suite | Covers |
| --- | --- |
| `test:auth` | sign-in, MFA, lockout, sessions, IP allowlist |
| `test:shell` | dark theme, nav, breadcrumbs, tables, search, notifications |
| `test:sa05` | metrics, Command Centre, directory, profiles, mutations |
| `test:sa06` | revenue KPIs, charts, transactions, dunning, refunds, cohorts |
| `test:sa07` | analytics, support workflow, SLA timers, user search, broadcast |
| `test:sa08` | system health, flags, config, audit/NDPR, growth tools |
| `test:sa10` | AI surfaces, report engine, exports, rate limits, CSP, health, seed |
| `test:impersonation` | cross-app read-only grant |

`test:sa08` and `test:impersonation` also need the school app running
(`pnpm --filter web dev`).

## 12. Deployment

See [`DEPLOYMENT.md § 13`](./DEPLOYMENT.md#13-super-admin-console) for the
full runbook. In short: build `apps/superadmin/Dockerfile` **from the repo
root**, deploy it behind Cloudflare with a CDN-level IP rule, and let
`.github/workflows/deploy-superadmin.yml` handle lint → build → migrate →
deploy → health check.
