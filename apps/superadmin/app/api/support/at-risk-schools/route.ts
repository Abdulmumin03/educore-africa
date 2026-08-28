import { NextResponse } from "next/server"

import { atRiskSchools } from "@/lib/support"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const schools = await atRiskSchools()
  return NextResponse.json({
    schools,
    total: schools.length,
    mrrAtRisk: schools.reduce((sum, school) => sum + school.mrr, 0),
  })
}
