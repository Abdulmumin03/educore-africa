import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { latestGrowthBatch, runGrowthRecommendations } from "@/lib/growth-ai"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const batch = await latestGrowthBatch()
  if (!batch) {
    return NextResponse.json({
      batch: null,
      notice: "No recommendations have been generated yet. Run the weekly batch to create the first set.",
    })
  }

  const ageDays = Math.floor((Date.now() - new Date(batch.generatedAt).getTime()) / 86_400_000)
  return NextResponse.json({
    batch,
    ageDays,
    // A fortnight-old recommendation is not this week's opportunity, and the
    // page should say so rather than quietly presenting it as current.
    stale: ageDays > 9,
  })
}

export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "BUSINESS_ADMIN", "SALES_ADMIN")
  if (forbidden) return forbidden

  const batch = await runGrowthRecommendations()

  await auditLog({
    userId: guard.user.id,
    action: "ai.growth-recommendations.run",
    target: auditTarget("system", `growth:${batch.batchId}`),
    targetType: "system",
    ipAddress: guard.ipAddress,
    details: { count: batch.recommendations.length, generated: batch.generated },
  })

  return NextResponse.json({ batch, ageDays: 0, stale: false })
}
