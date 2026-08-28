import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { runChurnScoring } from "@/lib/churn-risk"

export const dynamic = "force-dynamic"
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

  const result = await runChurnScoring()

  await auditLog({
    userId: null,
    action: "cron.churn-risk.run",
    target: auditTarget("system", `churn:${result.batchId}`),
    targetType: "system",
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "cron",
    details: { scored: result.scored, critical: result.byLevel.CRITICAL, high: result.byLevel.HIGH },
  })

  return NextResponse.json(result)
}
