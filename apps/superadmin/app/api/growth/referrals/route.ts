import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { REWARD_TIERS, createReferralCode, listReferrals } from "@/lib/referrals"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SALES_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  return NextResponse.json({ ...(await listReferrals()), tiers: REWARD_TIERS })
}

export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SALES_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  let body: { schoolId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const schoolId = typeof body.schoolId === "string" ? body.schoolId : ""
  if (!schoolId) return NextResponse.json({ error: "Pick a school." }, { status: 400 })

  const result = await createReferralCode({ schoolId, createdById: guard.user.id })
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 })

  await auditLog({
    userId: guard.user.id,
    action: "growth.referral.create",
    target: auditTarget("school", schoolId),
    targetType: "school",
    ipAddress: guard.ipAddress,
    details: { code: result.code },
  })

  return NextResponse.json({ code: result.code, id: result.id }, { status: 201 })
}
