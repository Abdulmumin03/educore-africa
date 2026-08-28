import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { auditTarget } from "@/lib/audit"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/** Everything EduCore staff have done TO this school, newest first. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const entries = await prisma.superAdminAuditLog.findMany({
    where: { targetType: "school", target: auditTarget("school", params.id) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      details: true,
      ipAddress: true,
      createdAt: true,
      user: { select: { id: true, name: true, role: true } },
    },
  })

  return NextResponse.json({
    entries: entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      details: entry.details,
      ipAddress: entry.ipAddress,
      at: entry.createdAt.toISOString(),
      actor: entry.user ? { name: entry.user.name, role: entry.user.role } : null,
    })),
  })
}
