import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { logDataAccess } from "@/lib/data-access"
import { createImpersonationGrant, IMPERSONATION_TTL_MINUTES } from "@/lib/impersonation"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/**
 * Mint a one-hour, read-only pass into a school's own app.
 *
 * The plaintext token is returned exactly once, in the redirect URL. Only its
 * hash is stored, so this response is the only chance to use it.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SUPPORT_ADMIN", "ENGINEERING_ADMIN")
  if (forbidden) return forbidden

  const school = await prisma.school.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, name: true, slug: true },
  })
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 })

  let reason: string | null = null
  try {
    const body = (await request.json()) as { reason?: unknown }
    if (typeof body.reason === "string" && body.reason.trim()) reason = body.reason.trim()
  } catch {
    // Reason is optional.
  }

  const grant = await createImpersonationGrant({
    schoolId: school.id,
    superAdminUserId: guard.user.id,
    ipAddress: guard.ipAddress,
    userAgent: request.headers.get("user-agent"),
    reason,
  })

  // Signing in as a school is the broadest read there is, so it belongs in the
  // NDPR access record as well as the audit trail.
  await logDataAccess({
    staffId: guard.user.id,
    schoolId: school.id,
    scope: "school.impersonation",
    path: `/console/schools/${school.id} (support session)`,
    ipAddress: guard.ipAddress,
  })

  await auditLog({
    userId: guard.user.id,
    action: "IMPERSONATION_START",
    target: auditTarget("school", school.id),
    targetType: "school",
    ipAddress: guard.ipAddress,
    details: {
      schoolName: school.name,
      grantId: grant.grantId,
      expiresAt: grant.expiresAt.toISOString(),
      ttlMinutes: IMPERSONATION_TTL_MINUTES,
      reason,
    },
  })

  return NextResponse.json({
    impersonationToken: grant.token,
    redirectUrl: grant.redirectUrl,
    expiresAt: grant.expiresAt.toISOString(),
    grantId: grant.grantId,
    school: { id: school.id, name: school.name, slug: school.slug },
  })
}
