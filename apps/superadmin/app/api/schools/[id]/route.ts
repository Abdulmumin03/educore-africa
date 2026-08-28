import { NextResponse } from "next/server"

import { featureAdoption, getSchoolDetail } from "@/lib/schools"
import { activeGrantsForSchool } from "@/lib/impersonation"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const school = await getSchoolDetail(params.id)
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 })

  const [adoption, grants] = await Promise.all([
    featureAdoption(school.id),
    activeGrantsForSchool(school.id),
  ])

  return NextResponse.json({ school, adoption, activeImpersonations: grants })
}
