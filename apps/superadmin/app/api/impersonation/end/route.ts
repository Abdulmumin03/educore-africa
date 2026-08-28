import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { endImpersonation } from "@/lib/impersonation"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  let grantId = ""
  try {
    const body = (await request.json()) as { grantId?: unknown }
    if (typeof body.grantId === "string") grantId = body.grantId
  } catch {
    // handled below
  }

  if (!grantId) return NextResponse.json({ error: "grantId is required." }, { status: 400 })

  const grant = await prisma.impersonationGrant.findUnique({
    where: { id: grantId },
    select: { id: true, schoolId: true, superAdminUserId: true, endedAt: true },
  })
  if (!grant) return NextResponse.json({ error: "Grant not found" }, { status: 404 })

  // Anyone may end a session they can see — stopping access is never gated.
  const ended = await endImpersonation(grantId)

  await auditLog({
    userId: guard.user.id,
    action: "IMPERSONATION_END",
    target: auditTarget("school", grant.schoolId),
    targetType: "school",
    ipAddress: guard.ipAddress,
    details: {
      grantId,
      startedBy: grant.superAdminUserId,
      alreadyEnded: !ended,
    },
  })

  return NextResponse.json({ ok: true, alreadyEnded: !ended })
}
