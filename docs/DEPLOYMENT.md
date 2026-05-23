# Deployment runbook

End-to-end production setup, in the order you should do it. Skip steps you've
already done.

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
It will NOT generate new ones (use `migrate dev` in development for that).

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
immediately bounced. See [`feedback_auth_secret.md`](../memory/feedback_auth_secret.md).

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

See [`project_p05_worker.md`](../memory/project_p05_worker.md) for what depends
on the worker (attendance SMS, scheduled announcements, exeat SMS, etc.).

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

| Endpoint | Cadence | Purpose |
| --- | --- | --- |
| `POST /api/cron/announcements/dispatch-scheduled` | every 5 min | publishes announcements whose `publishedAt` is now in the past |

Both expect `Authorization: Bearer $CRON_SECRET`. Set `CRON_SECRET` in env.

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

Then walk the [smoke-test paths](./README.md#6-where-to-look-when-something-breaks)
from each phase memory file to confirm everything end-to-end.

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
