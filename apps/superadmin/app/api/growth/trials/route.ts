import { NextResponse } from "next/server"

import { requireApiRole, requireApiSession } from "@/lib/session-guard"
import { listTrials } from "@/lib/trials"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SALES_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  const { trials, totalModules } = await listTrials()

  return NextResponse.json({
    trials,
    totalModules,
    summary: {
      total: trials.length,
      hot: trials.filter((trial) => trial.band === "hot").length,
      expiringWeek: trials.filter(
        (trial) => trial.daysRemaining !== null && trial.daysRemaining >= 0 && trial.daysRemaining <= 7,
      ).length,
      lapsed: trials.filter((trial) => trial.daysRemaining !== null && trial.daysRemaining < 0).length,
    },
  })
}
