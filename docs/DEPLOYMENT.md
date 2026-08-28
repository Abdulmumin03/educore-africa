# Deployment runbook

End-to-end production setup, in the order you should do it. Skip steps you've
already done.

**Steps 1–12 cover the school platform** (`apps/web`, port 3000). The Super
Admin Console is a second, independently deployed application — **step 13**.
They share one database and one migration history, so migrations are applied
**once**, not per app.

## 1. Provision managed services

| Service | Recommendation | Why |
| --- | --- | --- |
| Postgres | [Supabase](https://supabase.com) or [Neon](https://neon.tech) | Managed pooler, free dev tier, region in Frankfurt covers Africa with <100ms latency |
| Redis | [Upstash](https://upstash.com) | Serverless, pay-per-request, has an `eu-west-1` region |
| Files | AWS S3 (or any S3-compatible) | We use presigned PUTs; bucket needs CORS for browser uploads |
| Email | [Resend](https://resend.com) | Already wired |
| SMS / USSD | [Africa's Talking](https://africastalking.com) | Already wired; same account does both |
| Payments | [Paystack](https://paystack.com) | Already wired |
| WhatsApp | Meta Business / Cloud API | Optional |
| AI | Anthropic | Optional in dev, expected in prod |
| Error tracking | Sentry | Optional |
| CDN / WAF | [Cloudflare](https://cloudflare.com) | Required for the console — the IP allowlist's outer layer |

Copy the connection strings/secrets into a password manager. You'll need them
in step 4.

## 2. Database setup

```bash
# Replace with your managed connection strings
export DATABASE_URL="postgres://...?sslmode=require"
export DIRECT_URL="postgres://..." # Direct (no pooler) — required for migrations

pnpm --filter @educore/database exec prisma migrate deploy
```

`migrate deploy` is non-interactive — safe for CI and production. It only
applies migrations that already exist in `packages/database/prisma/migrations/`.
It will NOT generate new ones.

Both apps read the same schema, so **run this once per database**, not once
per app. Whichever workflow deploys first applies the migration; the other
finds nothing to do.

> Write migration SQL by hand and apply it with `migrate deploy`. `prisma
> migrate dev` misbehaves under `pnpm exec` in this workspace, and in
> production it would try to reset a drifted database — which is not something
> CI may ever do.

## 3. S3 bucket CORS

The web app uploads files directly to S3 via presigned URLs, so the bucket
needs CORS:

```json
[
  {
    "AllowedOrigins": ["https://your-app-domain.com"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

## 4. Environment variables

Set these in your hosting platform (Railway / Render / Fly.io / Vercel) — never
commit them. Required:

```
DATABASE_URL              # pooled
DIRECT_URL                # direct (Prisma migrate)
REDIS_URL                 # rediss:// for Upstash
NEXTAUTH_SECRET           # openssl rand -base64 32
NEXTAUTH_URL              # https://your-app-domain.com
GOOGLE_CLIENT_ID          # if you offer Google sign-in
GOOGLE_CLIENT_SECRET
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
S3_BUCKET
ANTHROPIC_API_KEY
PAYSTACK_SECRET_KEY
PAYSTACK_PUBLIC_KEY
AFRICASTALKING_API_KEY
AFRICASTALKING_USERNAME
RESEND_API_KEY
APP_VERSION               # git sha — surfaces on /api/health
NEXT_PUBLIC_APP_URL       # https://your-app-domain.com
```

Optional but recommended:

```
WHATSAPP_PHONE_ID
WHATSAPP_PROVIDER_TOKEN
SENTRY_DSN                # server-side
NEXT_PUBLIC_SENTRY_DSN    # browser-side (same DSN, different env var)
SENTRY_ORG                # for source-map upload
SENTRY_PROJECT
SENTRY_AUTH_TOKEN
```

`NEXTAUTH_SECRET` **must be set explicitly** — without it, Auth.js can't
decrypt session cookies and login appears to succeed but the user is
immediately bounced — the failure looks like a redirect loop, not a config
error, so check this first.

## 5. Build & run

### Option A — Hosted (Vercel / Railway / Render)

Push to the `main` branch. The [deploy workflow](../.github/workflows/deploy.yml)
builds + pushes the Docker image to GHCR, then a placeholder `release` job
hands off to your platform. Replace the placeholder step with:

- **Railway**: `railway up --service web --image ghcr.io/...`
- **Render**: `curl -X POST $RENDER_DEPLOY_HOOK`
- **Fly.io**: `flyctl deploy --image ghcr.io/...`

### Option B — Self-hosted Docker

```bash
docker build -f apps/web/Dockerfile -t educore-web .
docker run -d --name educore-web \
  --env-file .env.production \
  -p 3000:3000 \
  educore-web
```

The Dockerfile sets a `HEALTHCHECK` against `/api/health`. Inspect status:

```bash
docker inspect --format='{{.State.Health.Status}}' educore-web
```

## 6. Background worker

Attendance SMS and other queued jobs need a separate worker process — they
won't run from the web container.

```bash
# Self-hosted: a second container that shares the same env
docker run -d --name educore-worker \
  --env-file .env.production \
  educore-web pnpm --filter web worker
```

On Railway/Render: provision a second service from the same image with the
start command `pnpm --filter web worker`.

What depends on the worker: attendance SMS, scheduled announcements, exeat
OTP SMS, and every other BullMQ producer under `apps/web/lib/queues/`.

## 7. External webhooks

After the app is up and reachable, point each provider's webhook at it:

| Provider | Webhook URL | Verification |
| --- | --- | --- |
| Paystack | `https://<your-app>/api/finance/webhook/paystack` | HMAC SHA-512 (handled in code) |
| Africa's Talking (SMS delivery) | `https://<your-app>/api/notifications/sms/delivery` | IP allow-list |
| Africa's Talking (USSD) | `https://<your-app>/api/ussd` | IP allow-list |
| Paystack live mode | flip the secret key from `sk_test_*` to `sk_live_*` and the public key from `pk_test_*` to `pk_live_*` | n/a |

## 8. Scheduled jobs (cron)

Two endpoints expect external cron triggers (set them up in your hosting
platform's cron service):

| App | Endpoint | Cadence | Purpose |
| --- | --- | --- | --- |
| web | `POST /api/cron/announcements/dispatch-scheduled` | every 5 min | publishes announcements whose `publishedAt` has passed |
| console | `POST /api/cron/reports` | daily, 06:00 WAT | runs every scheduled report and emails the results |
| console | `POST /api/cron/churn-risk` | weekly | re-scores every paying school |
| console | `POST /api/cron/growth-recommendations` | weekly | regenerates "This week's opportunities" |

All expect `Authorization: Bearer $CRON_SECRET`. With `CRON_SECRET` unset the
console's endpoints refuse **every** caller rather than running
unauthenticated — so an unset secret looks like "the schedule never fires".

## 9. PWA icons

`public/manifest.json` currently references `/icons/icon.svg` only. Modern
Android Chrome accepts SVG, but if you need maximum compatibility (Apple
Touch icons, older Android, etc.) generate PNGs — instructions in
[`public/icons/README.md`](../apps/web/public/icons/README.md).

## 10. Sentry (optional)

In your Sentry org:

1. Create a project (Next.js platform).
2. Copy the DSN into `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`.
3. Generate an auth token with `project:releases` scope.
4. Set `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` as **GitHub Actions
   secrets** for `deploy.yml`.

Without these env vars, the SDK silently no-ops and source maps don't upload —
the app still works, you just don't get error events.

## 11. Verify

```bash
# Liveness
curl -s https://<your-app>/api/health | jq
# Expect: { "status": "ok", "db": "connected", "redis": "connected", ... }
```

Then confirm the console (step 13) and walk the troubleshooting list in
[`README.md`](./README.md#6-where-to-look-when-something-breaks).

## 12. Rollback

```bash
# Self-hosted
docker run -d --name educore-web-previous \
  --env-file .env.production \
  ghcr.io/<org>/<repo>/web:sha-<previous-commit-sha>
```

Images are tagged `sha-<commit>` by the deploy workflow, so rollback is
"point traffic at the previous tag." Migrations are forward-only — if a bad
migration ships, write a forward-fix migration rather than reverting the
schema in production.

Because both apps share the schema, **rolling one back does not roll back the
migration**. If a release contains a breaking schema change, roll back both
images or ship the forward fix.

---

## 13. Super Admin Console

The internal console (`apps/superadmin`, port 3001) deploys separately, to its
own hosts, on its own cadence. A release of one app must never require a
release of the other. Full operational detail is in
[`SUPERADMIN.md`](./SUPERADMIN.md).

### 13.1 DNS and TLS

| | Host |
| --- | --- |
| Production | `admin.educoreafrica.com` |
| Staging | `staging-admin.educoreafrica.com` |

Both sit behind **Cloudflare**, proxied (orange cloud), with:

- **Full (strict)** TLS and *Always Use HTTPS* on. The app adds
  `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  in production only — never in development, where it would pin `localhost`
  to HTTPS in a developer's browser.
- A **WAF IP access rule** allowing only the office and VPN egress ranges,
  blocking everything else at the edge.

The app enforces its **own** allowlist again on every request. Two layers is
the point: a Cloudflare rule can be changed by anyone with dashboard access;
`ALLOWED_IPS` cannot.

### 13.2 Environment

Everything the school app needs (`DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`,
`ANTHROPIC_API_KEY`) plus:

```
SUPERADMIN_SECRET         # openssl rand -base64 32 — MUST differ from NEXTAUTH_SECRET
ALLOWED_IPS               # office / VPN egress. Blank in prod = DENY ALL
NEXTAUTH_URL              # https://admin.educoreafrica.com
AUTH_URL                  # same
NEXT_PUBLIC_APP_URL       # same
CRON_SECRET               # bearer token for /api/cron/*
APP_VERSION               # git sha — surfaces on /api/health
```

Optional, and each one degrades honestly when absent:

```
S3_BUCKET, AWS_REGION,
AWS_ACCESS_KEY_ID,
AWS_SECRET_ACCESS_KEY     # scheduled report storage. Unset → Redis, 7-day TTL
RESEND_API_KEY, EMAIL_FROM  # report delivery. Unset → the run log says so
CHROMIUM_PATH             # /usr/bin/chromium in the image. Unset → PDFs become HTML
FLUTTERWAVE_SECRET_KEY    # unset → the status board reads "Not checked", not green
```

`SUPERADMIN_SECRET` keys both the session JWTs **and** the AES-256-GCM
encryption of stored TOTP seeds. Rotating it invalidates every session and
makes every stored seed undecryptable — every user must re-enrol. Plan it;
don't rotate it casually.

### 13.3 Build and run

```bash
# From the REPO ROOT — the console depends on the @educore/database workspace
docker build -f apps/superadmin/Dockerfile -t educore-superadmin .

docker run -d --name educore-superadmin \
  --env-file .env.superadmin.production \
  -p 3001:3001 \
  educore-superadmin
```

Multi-stage on `node:20-bookworm-slim`, runs as a non-root user, `EXPOSE 3001`,
`HEALTHCHECK` against `/api/health`. The runner stage installs Debian's
`chromium` so PDF exports render for real rather than degrading to HTML.

There is no `output: "standalone"` — the app imports a workspace package the
standalone tracer does not follow cleanly, so the built app plus the workspace
`node_modules` is copied instead. The image is larger and correct.

The console needs **no worker process**. Its scheduled work runs from
`/api/cron/*` (step 8).

### 13.4 CI/CD

[`.github/workflows/deploy-superadmin.yml`](../.github/workflows/deploy-superadmin.yml)
fires on pushes touching `apps/superadmin/**`, `packages/database/**` or the
lockfile, and on manual dispatch with a `staging` / `production` choice:

1. **verify** — `lint`, `check-types`, unit tests
2. **build-and-push** — image to `ghcr.io/<repo>/superadmin`, tagged
   `sha-<commit>` and `latest`
3. **migrate** — `prisma migrate deploy` against the target environment
4. **release** — **placeholder**; wire your platform's CLI or deploy hook here
5. **smoke** — `GET /api/health` with retries, failing the run on a degraded
   status and warning if the live `version` doesn't match the commit

Required secrets and variables, per GitHub environment:

| Name | Kind | Purpose |
| --- | --- | --- |
| `SUPERADMIN_DATABASE_URL` | secret | pooled connection for `migrate deploy` |
| `SUPERADMIN_DIRECT_URL` | secret | direct connection for `migrate deploy` |
| `SUPERADMIN_BASE_URL` | variable | e.g. `https://admin.educoreafrica.com`, for the smoke test |

### 13.5 First run

```bash
# One console account to bootstrap from
pnpm --filter superadmin admin:create -- \
  --email you@educoreafrica.com --name "Your Name" \
  --password "…" --role SUPER_ADMIN

# Platform configuration — templates, feature flags, the plan catalogue.
# Upserts by natural key, so it is safe to re-run on production.
pnpm --filter superadmin seed:platform
```

Do **not** run `seed:demo` or `seed:superadmin` against production: both
create `demo-` schools. `seed:superadmin` also creates the seven default
accounts with a shared default password — if you have run it anywhere
reachable, change those passwords immediately.

The first sign-in walks through TOTP enrolment and issues eight backup codes.
An account without TOTP cannot reach the console at all.

### 13.6 Verify

```bash
curl -s https://admin.educoreafrica.com/api/health | jq
# { "status": "ok", "db": "ok", "redis": "ok", "version": "<sha>", ... }
```

Then, from an allowlisted address, sign in and check:

- `/console/system` — every configured service reads **up**; unconfigured ones
  read **"Not checked"** with no uptime figure. That is correct, not a fault.
- `/console/analytics/reports` — export a small report as PDF. If it arrives
  as `.html`, Chromium is missing from the image.
- `/console` — the business snapshot and opportunities panels label themselves
  **Claude** or **Computed**. "Computed" means `ANTHROPIC_API_KEY` is unset.

From a **non**-allowlisted address, confirm you are refused — first by
Cloudflare, and then (bypassing the CDN, if you can) by the app.
