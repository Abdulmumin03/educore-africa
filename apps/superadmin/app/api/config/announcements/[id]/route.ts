import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "BUSINESS_ADMIN", "ENGINEERING_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const existing = await prisma.platformAnnouncement.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: "Announcement not found" }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (typeof body.isActive === "boolean") data.isActive = body.isActive
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim()
  if (typeof body.body === "string" && body.body.trim()) data.body = body.body.trim()
  if (typeof body.endsAt === "string") {
    const endsAt = body.endsAt ? new Date(body.endsAt) : null
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      return NextResponse.json({ error: "The end date is not valid." }, { status: 400 })
    }
    data.endsAt = endsAt
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 })
  }

  const announcement = await prisma.platformAnnouncement.update({
    where: { id: existing.id },
    data,
    select: { id: true, title: true, isActive: true, endsAt: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: body.isActive === false ? "config.announcement.deactivate" : "config.announcement.update",
    target: auditTarget("config", `announcement:${existing.id}`),
    targetType: "config",
    ipAddress: guard.ipAddress,
    details: { from: { isActive: existing.isActive }, to: { isActive: announcement.isActive } },
  })

  return NextResponse.json({ announcement })
}
