import { NextResponse } from "next/server"
import type { ReferralStatus } from "@prisma/client"

import { auditLog, auditTarget } from "@/lib/audit"
import { advanceReferral } from "@/lib/referrals"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const STATUSES = ["PENDING", "SIGNED_UP", "CONVERTED", "REWARDED"]

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SALES_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const status =
    typeof body.status === "string" && STATUSES.includes(body.status)
      ? (body.status as ReferralStatus)
      : null
  if (!status) return NextResponse.json({ error: "Pick a status." }, { status: 400 })

  // A referral cannot be attributed without knowing who signed up.
  const referredSchoolId =
    typeof body.referredSchoolId === "string" ? body.referredSchoolId || null : undefined
  if (status !== "PENDING" && referredSchoolId === null) {
    return NextResponse.json(
      { error: "Name the referred school before moving the referral past pending." },
      { status: 400 },
    )
  }

  const result = await advanceReferral({ id: params.id, status, referredSchoolId })
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 })

  await auditLog({
    userId: guard.user.id,
    action: "growth.referral.update",
    target: auditTarget("system", `referral:${params.id}`),
    targetType: "system",
    ipAddress: guard.ipAddress,
    details: { to: { status }, rewardMonths: result.rewardMonths },
  })

  return NextResponse.json({ ok: true, rewardMonths: result.rewardMonths })
}
