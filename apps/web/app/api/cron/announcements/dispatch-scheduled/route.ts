import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { dispatchAnnouncement } from "@/lib/announcement-dispatch"

export const runtime = "nodejs"
// Bypass any caching — this endpoint must always do real work when invoked.
export const dynamic = "force-dynamic"

const MAX_PER_RUN = 50

/**
 * Cron entrypoint: dispatch announcements whose `publishedAt` has passed but
 * which haven't been dispatched yet. Idempotent — sets `dispatchedAt` after
 * each successful run.
 *
 * Wire this up so it fires every minute (or however often you want
 * scheduling granularity). Examples:
 *
 *   Vercel `vercel.json`:
 *     { "crons": [{ "path": "/api/cron/announcements/dispatch-scheduled", "schedule": "* * * * *" }] }
 *
 *   Self-hosted (Linux crontab):
 *     * * * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://app.educore.africa/api/cron/announcements/dispatch-scheduled >/dev/null
 *
 * In production set `CRON_SECRET` and pass it via the `x-cron-secret` header.
 * Vercel's scheduler authenticates via the `Authorization: Bearer <CRON_SECRET>`
 * header — both are accepted below.
 */
async function handle(req: Request) {
  const expected = process.env.CRON_SECRET
  if (expected) {
    const header = req.headers.get("x-cron-secret")
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (header !== expected && bearer !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === "production") {
    // Refuse to run unauthenticated in production even if the env was forgotten.
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }

  const now = new Date()

  const due = await prisma.announcement.findMany({
    where: {
      deletedAt: null,
      dispatchedAt: null,
      publishedAt: { lte: now },
    },
    orderBy: { publishedAt: "asc" },
    take: MAX_PER_RUN,
  })

  const results: Array<{
    id: string
    recipients?: number
    error?: string
  }> = []

  for (const a of due) {
    try {
      const dispatch = await dispatchAnnouncement(a)
      await prisma.announcement.update({
        where: { id: a.id },
        data: { dispatchedAt: new Date() },
      })
      results.push({ id: a.id, recipients: dispatch.recipients })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown"
      console.error("[cron/dispatch-scheduled]", a.id, message)
      results.push({ id: a.id, error: message })
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    dispatched: results.length,
    capped: due.length === MAX_PER_RUN,
    results,
  })
}

export const POST = handle
export const GET = handle
