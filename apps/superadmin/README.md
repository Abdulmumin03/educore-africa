# EduCore Africa — Super Admin Console

Internal operations console for EduCore Africa staff. **This is not the
school-facing app.** It reads across every tenant, so nothing here may be
imported by `apps/web`, and nothing in `apps/web` should ever query the
`super_admin_*` tables.

- Dev URL: <http://localhost:3001/console> (the school app owns :3000)
- Prisma models live in the shared `@educore/database` package

## Running it

```bash
pnpm --filter superadmin dev      # or `pnpm dev:superadmin` from the repo root
```

`pnpm dev` at the repo root now starts **both** apps via turbo.

### First account

```bash
pnpm --filter superadmin admin:create -- \
  --email you@educoreafrica.com --name "Your Name" \
  --password "…" --role SUPER_ADMIN --totp
```

`--totp` pre-seeds the secret and prints an `otpauth://` URI. You can also
leave it off: **an account without TOTP cannot reach the console at all**, so
the first sign-in redirects to `/enroll-mfa`, walks through the QR code, and
issues backup codes. Re-running for an existing email resets that password.

## Configuration

Shared values (`DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`)
come from the repo-root `.env`. Console-only values live in
`apps/superadmin/.env.local` — see `.env.local.example`:

| Variable | Purpose |
| --- | --- |
| `SUPERADMIN_SECRET` | JWT secret. **Must differ** from the school app's `NEXTAUTH_SECRET`. |
| `ALLOWED_IPS` | Comma-separated allowlist. Blank = allow all in dev, deny all in production. |
| `NEXTAUTH_URL` / `AUTH_URL` | Pin sign-in redirects to :3001; the root `.env` points at :3000. |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the console. |

Next loads this app's `.env.local` before the root `.env`, so these override
the school app's values rather than colliding with them.

## Security model

### Sign-in

Two legs, and **the password leg never mints a session**:

| Leg | Endpoint | Result |
| --- | --- | --- |
| 1 | `POST /api/auth/signin` | password verified → 5-minute HMAC-signed challenge cookie, plus where to go next |
| 2 | `POST /api/auth/verify-mfa` | authenticator code, or a backup code → session |

`next` is `/mfa` normally, `/enroll-mfa` when the account has no TOTP yet, and
`/console` when the browser holds a valid "trusted device" cookie. The
challenge carries a `purpose` so an enrolment token cannot be replayed at the
MFA gate. It is **not** burned on a wrong code — the lockout counter is what
throttles guessing, so one mistyped digit does not cost a password re-entry.

Every secret check happens inside `lib/auth.ts`'s `authorize()`, so posting
directly at `/api/auth/callback/credentials` gains nothing.

### Sessions

- 30-minute idle window that slides forward on activity, capped by a fixed
  8-hour ceiling. Both live on the `SuperAdminSession` row.
- Max **2** concurrent sessions per user; a third revokes the least recently
  active one (`revokedReason: "concurrent-limit"`).
- The JWT carries `sessionId`. `lib/session-guard.ts` re-checks the row on
  every request, so revocation takes effect immediately. Middleware cannot do
  this (edge runtime, no DB), which is why the guard also runs in the console
  layout and in every route handler.
- Cookie is `educore-sa.session-token`, distinct from the school app so the
  two cannot clobber each other on localhost.

### Lockout

5 consecutive failures — password **or** code, counted together — lock the
account for 15 minutes. The counter lives on the user row, not Redis, so a
cache flush cannot hand an attacker a fresh allowance. Locked sign-ins return
`423`.

### IP allowlist

Two enforcement points, because the rule is "blocked only if the IP is in
neither the user's own list nor the global one" and the per-user list needs a
database:

- `middleware.ts` (edge) applies the global `ALLOWED_IPS` list to requests
  with no session cookie, and records the block by rewriting into
  `/api/internal/ip-blocked` (Prisma cannot run on the edge).
- `lib/session-guard.ts` (Node) applies **both** lists to every authenticated
  request, with the per-user list cached in Redis for 5 minutes. Call
  `invalidateUserAllowlist()` after editing it.

`/api/system/health` is exempt from both so a load balancer can probe it.

### TOTP

`otpauth` + `qrcode`. The seed is stored AES-256-GCM encrypted
(`lib/crypto.ts`, keyed off `SUPERADMIN_SECRET`) — a database dump alone will
not generate codes. During enrolment the candidate seed rides in an encrypted
cookie and is **never** written to the user row until a code proves it was
scanned, so a re-enrolment that is abandoned cannot lock anyone out.
Confirming issues 8 single-use bcrypt-hashed backup codes and revokes every
trusted device.

### Audit

`auditLog()` from `lib/audit.ts`, called explicitly (never middleware) so the
recorded verb reflects intent. Auth events use the fixed set in
`AUTH_ACTIONS`: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `MFA_SUCCESS`, `MFA_FAILED`,
`MFA_ENROLLED`, `BACKUP_CODE_USED`, `DEVICE_TRUSTED`, `SESSION_EXPIRED`,
`SESSION_REVOKED`, `ACCOUNT_LOCKED`, `IP_BLOCKED`, `LOGOUT`. `userId` is
nullable so a blocked IP or an unknown email is still recorded.

## Auth API

| Route | Purpose |
| --- | --- |
| `POST /api/auth/signin` | leg 1 — password, lockout, IP check |
| `POST /api/auth/verify-mfa` | leg 2 — TOTP or backup code, optional device trust |
| `POST /api/auth/logout` | revoke the session row, clear the cookie, audit |
| `GET /api/auth/me` | current user, MFA state, session clocks |
| `POST /api/auth/totp/enroll` | mint a candidate secret + QR |
| `POST /api/auth/totp/confirm` | verify, persist encrypted, issue backup codes |

`/api/auth/[...nextauth]` still serves Auth.js's own callback endpoints
underneath; the routes above deliberately shadow the ones we drive ourselves.

## Design system

Dark-only — there is no theme toggle. `dark` is fixed on `<html>`, and the
shadcn CSS variables in `app/globals.css` are pointed at the SA palette, so
Button, Card, Dialog and friends inherit the console theme without being
rewritten. Use the `sa-*` Tailwind tokens directly when a component needs a
specific layer or hue.

| Token | Hex | Use |
| --- | --- | --- |
| `sa-base` | `#0A1628` | Page canvas, sidebar |
| `sa-surface` | `#1E293B` | Cards, panels, topbar |
| `sa-raised` | `#293548` | Row hover, active nav |
| `sa-overlay` | `#334155` | Dropdowns, popovers |
| `sa-border` / `sa-border-em` | `#1E3A5F` / `#3B6090` | Subtle / emphasis |
| `sa-blue` `sa-teal` `sa-green` `sa-amber` `sa-red` `sa-purple` | | Brand + state |
| `sa-text` `sa-muted` `sa-dim` `sa-disabled` | | Four text ranks |

Type scale: `text-caption` 11 · `text-body` 13 · `text-h3` 15 · `text-h2` 18 ·
`text-h1` 24 · `text-metric` 28. Inter for interface, **JetBrains Mono for
every number** — put `.tabular` on any numeric cell so columns line up.

Layout tokens: `w-sidebar` / `ml-sidebar` (220px) and `h-topbar` / `pt-topbar`
(56px). `plan-*` colours are the validated categorical set for the plan mix;
do not substitute hues without re-running the palette validator.

The full design lives in `design/superadmin-console/` (open the canvas via
`/artifacts`).

## Shell

Three fixed zones: the sidebar and topbar are `position: fixed`, and `main` is
offset by both, so scrolling happens inside the content area and the chrome
never moves.

- **Sidebar** — grouped nav (Overview / Business / Operations / Platform),
  filtered by `allowedSections(role)`, active item carries an inset blue rail.
- **Topbar** — breadcrumb derived from the path via the nav config, ⌘K search
  trigger, notification bell, help, user menu.
- **⌘K palette** — `cmdk`. Pages match client-side off the nav config; schools
  and users come from `GET /api/search` (debounced, min 2 characters). cmdk's
  own filter is **off** — it would double-filter the server hits.
- **Notifications** — polled every 30s (paused on a hidden tab, refreshed on
  focus). See below.

## Notifications

There is no notification table. The feed is **derived** from rows that already
exist — schools created, payments received, tickets opened, and
`IP_BLOCKED` / `ACCOUNT_LOCKED` / `SESSION_REVOKED` audit entries — over a
14-day window. Read state is a single watermark per admin
(`SuperAdminUser.notificationsReadAt`): anything newer is unread, and "mark
all read" is one `UPDATE`.

| Route | Purpose |
| --- | --- |
| `GET /api/notifications` | latest 10 across all sources + `unreadCount` |
| `PATCH /api/notifications/read` | move the watermark to now |
| `GET /api/search?q=` | palette search over schools and school users |

## Commercial layer

EduCore's own business model, added in SA-05 and distinct from the school's
fee billing (`fee_invoices` / `payments`, which is parents paying the school):

| Table | What it holds |
| --- | --- |
| `school_subscriptions` | plan, status, cycle, amount, trial/renewal dates, promo |
| `school_crm_notes` | internal sales/support notes, never shown to the school |
| `school_usage_snapshots` | one row per school per month — API calls, storage, SMS, logins |
| `impersonation_grants` | time-boxed read-only passes; only the token hash is stored |

**`amount` is per billing cycle, and MRR is always derived** — a ₦552,600
termly plan is ₦184,200/month. `monthlyAmount()` in `lib/metrics.ts` is the
only place that conversion happens, so a cycle change can never leave a stored
`mrr` column out of step.

**Health score** (`lib/health.ts`) is computed, not stored: login recency 30,
fee-collection rate 25, module breadth 20, subscription standing 15, open
critical tickets 10. It is a pure function so the directory can score a whole
page from one SQL round trip.

## Metrics

`lib/metrics.ts` computes every headline figure from live rows, caches it in
Redis for 5 minutes, and upserts one `PlatformMetricSnapshot` per day.
`computeAndCachePlatformMetrics()` is safe to call from a cron and on demand.

```bash
GET /api/metrics/overview?refresh=1   # bypass the cache
GET /api/metrics/growth-trend         # 12 months of signups vs churn
GET /api/metrics/subscription-mix     # plan counts, MRR, share
GET /api/metrics/by-state             # choropleth data
GET /api/alerts                       # derived "action required" list
GET /api/activity-feed                # SSE stream, 5s poll, backfills on connect
GET /api/ai/business-snapshot         # 6h cache, heuristic fallback with no API key
```

No cron is wired up yet — the 5-minute refresh happens on read. Point a
scheduler at `/api/metrics/overview?refresh=1` when you want it precomputed.

## Impersonation

"View as Admin" mints a **one-hour, read-only** pass into a school's own app.

1. `POST /api/schools/[id]/impersonate` stores a sha256 of an opaque token and
   returns the plaintext exactly once, inside the redirect URL.
2. The school app's `/api/impersonation/accept` swaps it for an httpOnly
   cookie so the token never lingers in the address bar.
3. `apps/web` validates the grant against the database on **every** request,
   so revoking it takes effect immediately. No NextAuth session is ever
   created — the grant itself is the credential.
4. Web middleware refuses every non-GET while the cookie is present, which
   also covers server actions since those are POSTs.
5. A loud amber banner names the school and the expiry, with an exit link.

`IMPERSONATION_START` and `IMPERSONATION_END` are both written to the audit log.

## Revenue Intelligence

`/console/revenue` and four sub-pages, all backed by `lib/revenue.ts`.

| Table | What it holds |
| --- | --- |
| `subscription_transactions` | one charge per billing period: gateway, status, reference, failure reason, attempts, dunning state |
| `subscription_refunds` | full and partial refunds, with requester and approver |
| `subscription_revisions` | append-only history of plan, price and churn |

**Revision history is why NRR works.** The current `amount` says nothing about
what a school paid six months ago, so without it net revenue retention cannot
separate expansion from contraction. Every subscription and status change now
appends a revision; history only starts from SA-06, so earlier price changes
are invisible and the UI says so.

**One population rule across the module.** The stacked area chart counts the
same subscriptions MRR does (`ACTIVE` + `PAST_DUE`, plus `CHURNED` up to its
cancellation date). Trials and suspended schools are excluded — otherwise the
last point of the chart disagrees with the MRR card directly above it.

### Money movements are gated

`lib/gateways.ts` is the only place that talks to Paystack or Flutterwave, and
it **does not call them** unless `REFUNDS_LIVE=true` *and* the relevant secret
key is set. Otherwise a refund is recorded in our ledger with
`gatewaySent: false` and shown as "ledger" in the refund log; a retry moves the
charge back to `PENDING` for the billing job and says plainly that no card was
charged.

This is deliberate. A console that silently no-ops a refund is worse than one
that refuses — finance would reconcile against money that never left.

Refunds require **FINANCE_ADMIN** (or SUPER_ADMIN). Partial refunds are
supported and over-refunding is rejected.

### Dunning

"Send payment reminder" writes the in-app `Notification` the school's admins,
principal and bursar will see, and records the reminder against the charge.
It does **not** send SMS or email: dispatch belongs to the school app's BullMQ
worker, and a second sender would mean two rate limits. The response says so
explicitly (`channels: { inApp, sms: 0, email: 0 }`).

## Analytics Centre

`/console/analytics`, six tabs dispatched from `?tab=`. Only the selected
tab's queries run — the adoption matrix and the cohort grid are both heavy
enough that rendering all six on every visit would make the page unusable.

| Tab | Source | What it will not do |
| --- | --- | --- |
| Feature adoption | `featureAdoptionMatrix()` — one SQL statement with a correlated `EXISTS` per module | Report Alumni as 0%. No alumni table exists, so the row says **not built** |
| Cohort retention | `cohortRetention()` from `lib/revenue.ts` | Fill month-N cells a cohort has not reached; those render as dashes |
| Growth funnel | `growthFunnel()` | Guess pageviews. Stage 1 is marked **not measured** |
| Geographic | `geographicBreakdown()` | Draw a polygon map — see below |
| NPS & satisfaction | `npsSummary()` from `nps_responses` | Show CSAT. Tickets carry no satisfaction survey |
| API performance | `lib/api-metrics.ts` | Invent latency. See below |

**The funnel is genuinely nested.** Each stage is a strict subset of the one
above it: a school counts as "converted to paid" only if it also cleared
registration, onboarding and first value. Counting the stages independently
would let a later stage come out larger than an earlier one, which is not a
funnel — it is five unrelated numbers stacked in a chart that implies
progression.

**The adoption grid names its own denominator.** A school with no subscription
row has no plan column to sit in, so it is excluded and counted separately as
`unplanned`; the page prints "N of M schools have a plan and appear in the
grid" rather than quietly using a smaller total.

**Geography is a tile grid, not Leaflet.** At dashboard size most of Nigeria's
36 states render as unreadable slivers on a polygon map, and no offline
GeoJSON ships with this stack. Every state gets the same clickable tile, and
the table view carries the same numbers for anyone who wants them sorted.

**API performance is real sampling, not an APM.** `requireApiSession()` times
itself and pushes the duration into a capped Redis list per endpoint
(`apiperf:*`, 500 samples, 48h TTL). Ids are collapsed out of paths so
`/api/schools/abc.../usage` groups with its peers. The figures therefore cover
the session guard — a floor on latency rather than the whole handler — and
only endpoints that have actually been called; the tab says both.

**Cohort commentary is opt-in.** `/api/ai/retention-insights` is a POST that
fires only when someone clicks, caches for 24h, and labels itself: **Claude**
when the model wrote it, **Computed** when it fell back to arithmetic over the
same table. A heuristic dressed as AI would be worse than no panel.

## Support Console

`/console/support` with a 320px filter sidebar, a queue ordered the way an
agent should work it (unresolved first, then priority, then oldest), and a
right-hand slide-in for the ticket. The detail loads on demand — a fifty-row
queue would otherwise ship fifty conversation threads nobody opens.

**SLA targets are policy, not data.** They live in `SLA_TARGETS` in
`lib/support.ts` so a change is a reviewable diff:

| Priority | First response | Resolution |
| --- | --- | --- |
| Critical | 1h | 8h |
| High | 4h | 24h |
| Medium | 8h | 72h |
| Low | 24h | 168h |

The timer runs on the first-response target until someone replies publicly,
then on resolution; "at risk" (amber) is the last quarter of the window, and
past the target is red. A resolved ticket freezes — it either met its target
or it did not, and that verdict should not keep drifting. **Only a public
reply starts the response clock**: an internal note does not, and does not
move the ticket off `OPEN` either.

Internal notes are amber-bordered and labelled everywhere they appear, so an
agent can never mistake one for something the school can read.

`/console/support/sla` reports compliance, average first response and average
resolution, a per-status stacked bar by day and an agent leaderboard. CSAT is
shown as **unavailable**, not zero — there is no satisfaction survey to
average.

`/console/support/health` is the at-risk monitor: four independent signals
(stale logins, overdue invoices, open tickets, low module adoption), and every
row says which one fired.

### Broadcast

`/console/support/broadcast` targets by plan, state, subscription status or
named schools, previews the exact recipient count from the same predicate the
send uses, and requires a second confirmation.

The console **dispatches IN_APP only**. SMS, email, WhatsApp and push are
recorded as requested and reported back in `deferred[]` with the reason —
those senders live in the school app and bill against each school's own
credit. The composer marks them "not sent from here" before you tick them.
Broadcasts require **BUSINESS_ADMIN** (or SUPER_ADMIN); they reach every
school administrator and principal in the audience.

## User management

`/console/users` searches **every tenant at once** — support does not need to
know which school an account belongs to before looking it up. Filters are
role, status and school; every control writes to the URL so a result is
shareable.

**Lock** means deactivate *and* drop every live session. There is no lockout
column on `User` — the school app gates sign-in on `isActive` — and without
the session sweep a locked user would stay signed in until their cookie
lapsed, which is not a lock. A reason is required.

**Reset password** issues a temporary password, shows it once, and clears
every session. It cannot force a rotation at next sign-in: the platform has no
reset-token table and no must-change-password flag. The response says so
rather than implying an enforced flow.

`/console/users/staff` is the console roster: role, MFA state, IP allowlist,
live sessions. Creating and editing staff is **SUPER_ADMIN only** — it grants
access to every school's data. New accounts are created without TOTP and the
auth flow forces enrolment before the console opens, so there is no window in
which a staff account is password-only. Changing a password or resetting MFA
revokes that account's live sessions; you cannot demote or deactivate
yourself.

`/console/users/anomalies` reports only what the platform can observe: a
blocked console sign-in, an account lockout, repeated failures from one
address, an account using an unusual number of addresses. **New country and
impossible travel are listed as unavailable** — there is no geo-IP database in
this stack, and claiming a country from an IP string alone would be a guess
dressed as a security finding. Device fingerprinting is not collected either.

## System health

`/console/system`. Everything on this page is a real measurement; nothing is
modelled.

**Service status** probes nine services and streams the board over SSE (30s
pushes) while the probe itself runs at most once a minute, so a dozen open tabs
do not mean a dozen calls a minute to Paystack. A service the console cannot
reach — no key set, no endpoint — is **Not checked**, never green, and its
uptime is blank rather than 100%. Postgres and Redis are pinged directly;
Paystack, Flutterwave, Africa's Talking and Anthropic get a real authenticated
call; S3 gets an anonymous HEAD, which proves the bucket resolves and says on
the card that it does **not** prove our credentials work.

Uptime is computed from the probes this console has actually recorded, so it
starts at 100% on a fresh Redis and needs a month of samples to mean a month.

**API errors** captures exactly the rejections the session guard produces —
expired or revoked sessions, blocked addresses, deactivated accounts. It does
not see the school app (separate process, no shared error store) and it does
not see plain "not signed in" 401s, which edge middleware answers before any
route runs. Identical failures group into one row with a count. An endpoint
crossing a 10% error rate on 10+ calls is flagged as a spike.

**Background jobs.** The platform runs exactly ONE BullMQ queue: `attendance`,
driven by apps/web's worker. The four the console was specced to show —
notifications, AI scoring, report generation, email delivery — have no producer
and no worker anywhere in the codebase, so they are listed as **not
implemented** with the reason, rather than as four rows of zeroes that read as
"idle". Retrying one of them is refused and says why. The live queue shows real
BullMQ counts and its failed jobs can be re-queued individually or in bulk.

**Performance** charts P50/P95/P99 by hour from the same guard sampling, with
gaps where there was no traffic. The connection gauge reads `pg_stat_activity`
(and says those are the pooler's connections behind a pooler); the Redis gauge
reads `INFO memory` and draws no percentage bar when no `maxmemory` is
configured, because there is no ceiling to draw against.

## Feature flags

`/console/system/feature-flags`. Scopes are global, by plan, by school id or by
state, with a 0–100 rollout.

**A toggle is live on the next evaluation, not after a TTL.** The write clears
the Redis read cache before it responds; the 30-second TTL on that cache is a
safety net for a flush or a lost race, not the propagation delay. The smoke
test measures the round trip and asserts it — it lands in about 200ms.

A partial rollout buckets each school by `sha256(flagKey + schoolId)`, so a
school stays on the same side of the split across requests, servers and
restarts. A percentage that re-rolls per request is not a rollout, it is a coin
flip on every page load. Without a school in context — a platform-wide job — a
partial rollout resolves to the default rather than flipping per call.

The key is immutable after creation (code reads flags by name, and a rename
silently turns the feature off everywhere), and an **enabled** flag cannot be
deleted — disable it first. Every change is audited.

## Platform configuration

`/console/config`, five tabs.

**Plans & pricing** edits the catalogue in `plan_configs`, which is
deliberately separate from `SchoolSubscription.amount`. Saving here changes what
new signups and console-made plan changes cost; it does **not** re-price a
school already on a plan, the page says so, and each row shows how many schools
that means. An annual price above twelve monthly payments is refused as a
data-entry slip. One audit row per plan changed, with before and after.

**Promo codes** are validated by `packages/database/promo.ts` — the same module
the school app calls at signup, taking each app's own Prisma client. It lives
in the shared package precisely because a code the console calls valid and
signup then rejects is worse than having no promo system. The rules: active, in
date, under its cap, applicable to the plan, not already redeemed by this
school. The unique index on `(promoCodeId, schoolId)` is what actually prevents
a double redemption; the check only supplies a readable message. A code that
has been redeemed is deactivated rather than deleted — the ledger references it.

**Email and SMS templates** version every edit. Saving snapshots the OUTGOING
wording first, so "restore version 3" restores what version 3 actually said,
and a rollback is itself a versioned edit. A merge tag not on the allow-list is
refused on save: an unsubstituted `{{typo}}` reaches the recipient as written.
SMS shows live segment counts (160 for one message, 153 each beyond that) and a
phone mockup, because three segments look very different on a handset from one.
Editing changes future sends only and the response says so. **Send test** goes
through Resend over plain HTTP and reports `sent: false` with the reason when
`RESEND_API_KEY` is absent — the same rule the refund gateway follows. SMS test
sends are refused outright: that sender and its credit balance belong to the
school app.

**Announcements** are persistent banners inside school dashboards, unlike a
broadcast (SA-07), which writes one notification and is done. A maintenance
notice must carry an end date — it would otherwise stay up until somebody
remembered it. apps/web reads them through `lib/platform-notices.ts` and renders
`PlatformBanner`; dismissal is remembered per browser, and a non-dismissible
notice has no close button.

## Audit & compliance

`/console/audit`, four tabs, ENGINEERING_ADMIN or SUPER_ADMIN.

**Audit trail** filters by date, user, action and target type, and expands the
before/after pair where an action recorded one. Pre-auth events (a blocked IP,
an unknown email) show as *Unauthenticated* rather than a blank user.

**Export as PDF** honours the filters on screen and stamps a **SHA-256 digest
of the exported rows** on every page. It is NOT a digitally signed PDF: signing
needs an X.509 certificate and a signing library, neither of which this
platform has, and the document says in as many words that the digest detects
alteration of the export but does not certify the issuer. Truncation past 2,000
rows is printed on the document, never silent. The export is itself audited.

**Data access** is the NDPR obligation the audit trail does not cover: that one
records what staff CHANGED, this one records what they SAW. Written explicitly
at the school profile (per tab, because "looked at the overview" and "read the
student roll" are different disclosures) and at impersonation, and awaited
rather than fired and forgotten. Duration is blank on most rows: the console
knows when a page opened, not when the reader looked away, and a made-up dwell
time would be worse than an empty column.

**NDPR requests** track access, deletion and portability with the statutory
30-day clock. The due date is stamped when the request is logged, so changing
the window later cannot re-date requests in flight. Closing a request without
recording what was done is refused — that record is the entire point.

**Erasure** is SUPER_ADMIN-only, needs the phrase `ERASE` typed, and cannot run
twice. It **anonymises rather than hard-deletes**: a student row is referenced
by attendance, grades, invoices and report cards, and deleting it would either
cascade a school's academic history away or fail on a foreign key. Identifying
fields go, the account is disabled, sessions and notifications are removed, and
non-nullable `Student.dateOfBirth` is coarsened to 1 January of the same year
(the standard k-anonymity step) rather than replaced with a made-up date. The
`DataDeletionRecord` outlives the data it describes — that is the point.

## Growth tools

`/console/growth`, three tabs, SALES_ADMIN or BUSINESS_ADMIN.

**Lead pipeline** is a six-column kanban with native HTML5 drag-and-drop. Leads
are a separate table from schools on purpose: a prospect is not a tenant, so
the platform's school count never inflates with the pipeline and a lost lead
leaves nothing behind. A drop sends the destination stage plus the ids either
side, and the SERVER resolves the position by midpoint insertion — the client
never invents an ordering number, so two people dragging at once cannot produce
a board that disagrees with itself. Marking a lead lost requires a reason. The
win rate is over SETTLED leads, not all leads: counting a lead that arrived
yesterday as a failure to convert would make the number meaningless.

**Trials** score conversion likelihood 0–100 from four observed signals —
students on the roll (35), colleagues invited (25), modules explored (25), days
active (15) — capped before weighting. The NUMBER is arithmetic in
`lib/trials.ts`: reproducible, testable, and arguable. Claude is asked only to
write the reasoning around it (`POST /api/ai/trial-conversion-score`, cached
6h), and the panel labels itself **Claude** or **Computed** so a heuristic can
never pass as analysis. A likelihood that moved between refreshes would be
worse than no score at all.

Actions: extend (from today when the trial already lapsed, not from a stale end
date), convert (which also writes the `SubscriptionRevision` the revenue module
needs to see the expansion), nudge (in-app only; the response reports
`sms: 0, email: 0`) and lost.

**Referrals** award free months on the referred school CONVERTING, not signing
up — paying out at signup would make the programme trivially farmable. Codes
avoid `0/O/1/I` because they get read out over the phone. The reward is
recomputed from the referrer's converted count on every move rather than
incremented, so un-converting a referral cannot leave a paid-out month behind;
totals across a referrer always equal the tier table.

## Demo data

The console is unusable against an empty database. `seed:demo` creates 70
schools across 22 Nigerian states with subscriptions, users, students, staff,
six months of usage, CRM notes, tickets (with comments, assignments and a
slice deliberately left to breach their SLA), NPS responses and two past
broadcasts.

It also creates **academic records** — a curriculum, an academic year and
term, classes with sections, subjects, enrolments, registers and grades — for
about four schools in five. Without them the growth funnel and the adoption
grid read a platform where nobody has done anything, since "onboarded" and
"first value" are defined against exactly those tables. The coverage is
deliberately partial: the drop-off between funnel stages has to come from
somewhere real.

Every row it creates has a `demo-` slug and it never touches anything else:

```bash
pnpm --filter superadmin seed:demo            # create
pnpm --filter superadmin seed:demo -- --undo  # remove
```

`seed:platform` is a different thing and is **not** demo data. Message
templates, feature flags and the plan catalogue are configuration the platform
genuinely needs, so it upserts them by natural key and is safe to re-run — it
refreshes labels and descriptions but never flips a flag somebody deliberately
set or clobbers wording somebody edited:

```bash
pnpm --filter superadmin seed:platform                  # templates, flags, promo codes
pnpm --filter superadmin seed:platform --with-samples   # plus leads, referrals, NDPR rows
```

`seed-superadmin` is the third one, and the one the SA-10 spec asks for. It
creates the seven console accounts (one per role, `admin@educoreafrica.com`
being the SUPER_ADMIN), tops the platform up to 50 `demo-` schools across ten
states, back-fills six months of daily `PlatformMetricSnapshot` rows, twenty
support tickets and thirty subscription transactions:

```bash
pnpm --filter @educore/database seed:superadmin   # the console data alone
pnpm prisma db seed                               # the school seed, then this
```

It is additive and idempotent — re-running tops the counts back up rather than
duplicating — and it never deletes a row it did not create. Its randomness is
a fixed-seed PRNG rather than `Math.random`, so two people seeding the same
database see the same dashboard and "is this number right?" stays answerable.
The snapshot series is walked **backwards from today's real figures**, so the
history joins up with what the console actually shows instead of contradicting
it on the most recent day. TOTP is deliberately not pre-enrolled: the console
walks every new account through enrolment on first sign-in, and skipping that
would leave a password-only door into the platform console. Set
`SEED_SUPERADMIN_PASSWORD` to choose the initial password.

The `--with-samples` rows are illustrative and gated behind the flag so a
production run does not invent a sales pipeline. The sample DELETION request
only ever points at a `demo-` account; if there is none it is logged without a
subject and the console refuses to execute it, because staging a real person
for erasure in a demo is not a risk worth taking for a nicer screenshot.

## AI intelligence

Five surfaces, one rule: **anything that is a number is arithmetic, and Claude
only ever writes the prose around it.** Every panel says which of the two it
is looking at, and each has a computed fallback so an unset `ANTHROPIC_API_KEY`
degrades the wording rather than emptying the page.

| Surface | Route | Where it shows |
|---|---|---|
| Weekly business snapshot | `GET /api/ai/business-snapshot` · `…/stream` | Command Centre, bottom |
| Retention insights | `GET /api/ai/retention-insights` | Analytics → Retention |
| Trial conversion score | `GET /api/ai/trial-conversion-score` | Growth → Trials |
| Churn risk | `GET|POST /api/ai/churn-risk` | School directory badge · Growth → At-risk schools |
| Growth recommendations | `GET|POST /api/ai/growth-recommendations` | Command Centre → This week's opportunities |
| Ticket triage | `POST /api/ai/categorise-ticket` | Support → ticket panel → Suggest triage |

**Churn risk** is a weighted sum over four observed signals — silence since
last login (40), overdue payment (25), shallow module adoption (20), recent
tickets (15) — capped per axis so 300 days of silence cannot swamp everything
else. ≥70 is CRITICAL, ≥45 HIGH, ≥22 MEDIUM. A school nobody has ever signed
into scores `daysSinceLogin: 999`, not 0; treating "never" as "today" would
hide exactly the accounts this exists to find. Claude narrates the worst
twenty-five; the rest carry a computed verdict, and each row says which. Only
HIGH and CRITICAL count toward MRR at risk.

**Ticket triage suggests and never applies.** The category, the priority and
the draft reply all sit behind buttons an agent presses. A model that could
set CRITICAL unattended would be starting an SLA clock unattended, and that
clock is what the support board is measured on.

The snapshot streams over SSE (`delta` / `done` / `error`) because a cold
generation takes most of a minute. The `done` event carries the same body the
JSON route returns and replaces whatever accumulated, so a partial generation
can never be left on screen looking finished. It uses the Anthropic SDK's own
streaming rather than the Vercel AI SDK — a second client library for one
endpoint would mean two places to keep the model ids and effort settings in
step.

## Reports

`/console/analytics/reports` builds a report in five steps — source, fields,
filters, sort and limit, schedule — with Preview, Save and Export Now.

`lib/reports.ts` is the query engine and the security boundary. **Nothing from
the request ever reaches SQL.** Every column and every filter names a key in a
hand-written catalogue that maps to a fixed SQL fragment; six sources
(schools, revenue, users, tickets, usage, feature adoption), typed operators,
20,000 rows maximum. A filter that does not typecheck **rejects the whole
report** rather than being dropped — a silently ignored filter returns more
rows than were asked for, which is the dangerous direction.

Exports come in four flavours:

| Format | Built by | Notes |
|---|---|---|
| `xlsx` | ExcelJS | navy header, striped rows, autofilter, frozen header, `₦` and `dd/mm/yyyy` formats, an "About" sheet carrying any truncation |
| `csv` | Papa Parse | column labels as the header; leading `=`/`+`/`@` neutralised |
| `pdf` | Chromium via Playwright | A4 landscape, **light theme** with a cover page and a confidentiality footer |
| `html` | — | what a PDF request degrades to |

PDF rendering needs a browser. Where there is none the job stores the
print-ready HTML instead, **renames the file to `.html`** and returns the
reason — the caller shows it. Nothing is ever labelled as a PDF that is not
one. The production image installs Debian's `chromium` so the real path runs
there; `CHROMIUM_PATH` points at it.

Three jobs run on a schedule, each behind `CRON_SECRET` and each refusing
every caller when that is unset rather than running unauthenticated:
`/api/cron/reports` (daily, 06:00 WAT), `/api/cron/churn-risk` and
`/api/cron/growth-recommendations` (weekly). Reports go through
`lib/report-scheduler.ts`: build the workbook → S3 with a 7-day presigned URL, or
Redis if no bucket is configured → email through Resend → write
`ReportRunLog`. The run log records what actually happened, so a run with no
object store and no mail key still succeeds and says both:

```
Stored in Redis for 7 days because no object store is configured.
RESEND_API_KEY is not set, so no email was sent.
```

## Production hardening

**Rate limits** are Redis sliding windows (sorted sets), enforced in the app
rather than middleware — the edge runtime has no ioredis, the same constraint
that already pushes the IP allowlist into `lib/session-guard`.

| Surface | Limit | On Redis failure |
|---|---|---|
| `/api/auth/*` | 10/min per IP | **fails closed** — 503 |
| `/api/*` | 200/min per authenticated user | fails open |

Auth fails closed on purpose: a console still accepting unlimited password
attempts because a cache blipped has lost the one thing between an attacker
and an unlimited guess rate. Rejected requests are removed from the window, so
a client that backs off recovers on schedule instead of being punished for
retrying. Loopback is exempt **outside production only** — a limiter that
makes the smoke suites unrunnable gets switched off wholesale, which is worse
than one documented carve-out.

**Headers** come from `next.config.mjs`: a CSP with `default-src 'self'`,
`frame-ancestors 'none'`, `object-src 'none'` and `connect-src 'self'`;
Permissions-Policy; COOP/CORP; `X-Frame-Options: DENY`; nosniff; no
`X-Powered-By`. `script-src` carries `'unsafe-inline'` because Next's own
bootstrap is an inline script, and `'unsafe-eval'` in development only — both
loosenings are commented where they are set rather than left to be discovered.
HSTS (`max-age=31536000; includeSubDomains; preload`) is **production only**;
sending it from a dev server would pin `localhost` to HTTPS in the developer's
browser.

**Error boundaries** are Next's own `error.tsx` — one under `/console`, one at
the root, plus `global-error.tsx` for a failure in the root layout. Each shows
the message and the `digest`, because an operator reporting a problem needs
something to paste. Sentry is not wired into this app; the boundary says so
rather than implying reporting that does not happen.

**`GET /api/health`** is the canonical probe: `{status, db, redis, version,
timestamp, latencyMs}`, 200 when both backends answer and 503 when either does
not. It is deliberately outside the session guard and the IP allowlist — the
container runtime, the load balancer and the deploy smoke test all call it and
none of them are on the office network. `/api/system/health` stays as an alias.

## Deployment

```bash
docker build -f apps/superadmin/Dockerfile -t educore-superadmin .   # from the REPO ROOT
docker run -p 3001:3001 --env-file apps/superadmin/.env.local educore-superadmin
```

Multi-stage (deps → builder → runner) on `node:20-bookworm-slim`, non-root,
`EXPOSE 3001`, `HEALTHCHECK` against `/api/health`. The runner installs
Debian's `chromium` for PDF rendering and sets `CHROMIUM_PATH`. There is no
`output: "standalone"` — the app imports a workspace package that the
standalone tracer does not follow cleanly.

`.github/workflows/deploy-superadmin.yml` runs on pushes that touch
`apps/superadmin/**`, `packages/database/**` or the lockfile: lint +
type-check + unit tests → build and push to GHCR → `prisma migrate deploy`
(never `migrate dev`, which would try to reset a drifted database) → deploy →
smoke-test `GET /api/health`. **The deploy step itself is a placeholder** —
the image is in the registry and the step needs the hosting platform's CLI or
deploy hook.

| | Host | Notes |
|---|---|---|
| Production | `admin.educoreafrica.com` | |
| Staging | `staging-admin.educoreafrica.com` | |

Both sit behind Cloudflare with an IP allowlist **at the CDN**, and the app
enforces its own allowlist again on every request. Two layers, because a
Cloudflare rule can be edited by anyone with dashboard access and the app's
list cannot. Force HTTPS at the edge; the app adds HSTS.

## Layout

```
app/(auth)      login · mfa · enroll-mfa
app/console     protected console routes (shell in layout.tsx)
app/api/auth    the auth API above
app/api         search · notifications · system/health · internal
                analytics · support · users · internal-users · broadcast · ai
                system (services · errors · queues · performance · flags)
                config (plans · promo-codes · templates · announcements)
                audit · compliance · growth
                ai (business-snapshot[/stream] · churn-risk ·
                growth-recommendations · categorise-ticket · …)
                reports · export · health · cron
components/ui   shadcn primitives
components/     layout (sidebar · topbar · nav · command-palette ·
                notification-bell) · charts · tables · shared
lib/            auth · auth-challenge · auth-flow · session-guard · session
                crypto · totp · totp-enrolment · backup-codes · trusted-device
                lockout · ip · audit · db · redis · ai · exports · permissions
                metrics · revenue · schools · health · gateways · plans
                analytics · api-metrics · support · anomalies · users ·
                broadcast · console-roles
                services · api-errors · queues · infra-metrics · flags
                promo · templates · announcements · data-access · compliance
                leads · trials · referrals · audit-query · audit-pdf
                churn-risk · growth-ai · business-snapshot
                reports · report-export · report-scheduler · export-jobs
                rate-limit · rate-guard
```

File naming is kebab-case throughout, matching the rest of the monorepo.

## Checks

```bash
pnpm --filter superadmin check-types
pnpm --filter superadmin lint
pnpm --filter superadmin test          # vitest units
pnpm --filter superadmin build
```

The end-to-end checks need a **running dev server** and the real database.
Each creates and deletes its own throwaway accounts and fixtures, so all of
them are safe to re-run:

```bash
pnpm --filter superadmin test:auth           # sign-in, MFA, lockout, sessions, IP allowlist
pnpm --filter superadmin test:shell          # dark theme, nav, breadcrumb, table, search, notifications
pnpm --filter superadmin test:sa05           # metrics, Command Centre, directory, profile, mutations
pnpm --filter superadmin test:sa06           # revenue KPIs, charts, transactions, dunning, refunds, cohorts
pnpm --filter superadmin test:sa07           # analytics, support workflow, SLA timer, user search, broadcast
pnpm --filter superadmin test:sa08           # health, flags, config, audit/NDPR, growth; needs `pnpm --filter web dev` for the promo-at-signup checks
pnpm --filter superadmin test:sa10           # AI surfaces, report engine, exports, rate limits, CSP, health, seed
pnpm --filter superadmin test:impersonation  # cross-app; needs `pnpm --filter web dev` too
```
