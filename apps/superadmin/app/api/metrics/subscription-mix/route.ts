import { NextResponse } from "next/server"

import { getRevenueBreakdown } from "@/lib/metrics"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const breakdown = await getRevenueBreakdown()
  const totalSchools = breakdown.byPlan.reduce((sum, row) => sum + row.schools, 0)

  return NextResponse.json({
    plans: breakdown.byPlan.map((row) => ({
      ...row,
      schoolShare: totalSchools > 0 ? (row.schools / totalSchools) * 100 : 0,
    })),
    totalSchools,
    totalMrr: breakdown.totalMrr,
  })
}
