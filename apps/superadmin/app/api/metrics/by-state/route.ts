import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { getRevenueBreakdown } from "@/lib/metrics"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/**
 * School count and MRR per state. Counts come from every school (not only
 * subscribed ones) so the map matches the directory; MRR comes from the
 * revenue breakdown.
 */
export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const [grouped, breakdown] = await Promise.all([
    prisma.school.groupBy({
      by: ["state"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    getRevenueBreakdown(),
  ])

  const mrrByState = new Map(breakdown.byState.map((row) => [row.state, row.mrr]))
  const topPlanByState = new Map(breakdown.byState.map((row) => [row.state, row.topPlan]))

  const states = grouped
    .map((row) => {
      const state = row.state?.trim() || "Unspecified"
      return {
        state,
        schools: row._count._all,
        mrr: mrrByState.get(state) ?? 0,
        topPlan: topPlanByState.get(state) ?? null,
      }
    })
    .sort((a, b) => b.schools - a.schools)

  return NextResponse.json({
    states,
    maxSchools: states.reduce((max, row) => Math.max(max, row.schools), 0),
    totalSchools: states.reduce((sum, row) => sum + row.schools, 0),
  })
}
