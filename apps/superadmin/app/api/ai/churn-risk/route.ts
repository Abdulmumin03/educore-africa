import { NextResponse } from "next/server"
import type { ChurnRiskLevel } from "@prisma/client"

import { auditLog, auditTarget } from "@/lib/audit"
import { latestScores, runChurnScoring } from "@/lib/churn-risk"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"
// Scoring the whole platform is a handful of aggregate queries plus one model
// call; the default 15s would cut it off on a large tenant list.
export const maxDuration = 120

const LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const level = new URL(request.url).searchParams.get("level")
  return NextResponse.json(
    await latestScores({
      level: level && LEVELS.includes(level) ? (level as ChurnRiskLevel) : undefined,
    }),
  )
}

/**
 * Re-score every paying school.
 *
 * Normally driven by /api/cron/churn-risk once a week; this is the manual
 * trigger behind the "Re-score now" button.
 */
export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "BUSINESS_ADMIN", "SALES_ADMIN", "SUPPORT_ADMIN")
  if (forbidden) return forbidden

  const result = await runChurnScoring()

  await auditLog({
    userId: guard.user.id,
    action: "ai.churn-risk.run",
    target: auditTarget("system", `churn:${result.batchId}`),
    targetType: "system",
    ipAddress: guard.ipAddress,
    details: {
      scored: result.scored,
      narrated: result.narrated,
      critical: result.byLevel.CRITICAL,
      high: result.byLevel.HIGH,
    },
  })

  return NextResponse.json({
    ...result,
    notice: result.generated
      ? undefined
      : "Scores are arithmetic; the reasons were written from the signals rather than by Claude.",
  })
}
