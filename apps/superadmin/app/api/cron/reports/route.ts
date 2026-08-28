import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { runDueReports, schedulesDueToday } from "@/lib/report-scheduler"

export const dynamic = "force-dynamic"
// The sweep runs every due report sequentially; a big Monday can take minutes.
export const maxDuration = 300

/**
 * Authenticate a scheduler.
 *
 * There is no cron daemon in this app. An external scheduler — the platform's
 * own, or a GitHub Actions `schedule` — calls these endpoints with a bearer
 * token. Same pattern apps/web already uses for its cron routes.
 *
 * With CRON_SECRET unset the route refuses everything rather than running
 * open: an unauthenticated endpoint that re-scores the platform and emails
 * files is not something to leave ajar by default.
 */
function authorised(request: Request): { ok: true } | { ok: false; response: Response } {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "CRON_SECRET is not set, so scheduled runs are disabled." },
        { status: 503 },
      ),
    }
  }

  const header = request.headers.get("authorization") ?? ""
  const provided = header.startsWith("Bearer ") ? header.slice(7) : ""
  // Length-independent compare is overkill for a shared secret behind an IP
  // allowlist, but a plain !== leaks length through timing and costs nothing
  // to avoid.
  if (provided.length !== secret.length || provided !== secret) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorised" }, { status: 401 }) }
  }

  return { ok: true }
}

export async function POST(request: Request) {
  const auth = authorised(request)
  if (!auth.ok) return auth.response

  const result = await runDueReports()

  await auditLog({
    userId: null,
    action: "cron.reports.sweep",
    target: auditTarget("system", "scheduled-reports"),
    targetType: "system",
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "cron",
    details: { due: result.due, succeeded: result.succeeded, failed: result.failed, schedules: result.schedules },
  })

  return NextResponse.json(result)
}

/** So an operator can see what WOULD run without running it. */
export async function GET(request: Request) {
  const auth = authorised(request)
  if (!auth.ok) return auth.response
  return NextResponse.json({ schedulesDueToday: schedulesDueToday(), ranNothing: true })
}
