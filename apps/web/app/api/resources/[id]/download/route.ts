import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

/**
 * POST /api/resources/[id]/download — increments the download counter.
 *
 * Idempotent per user per UTC day: callers can hit this freely; we de-dupe
 * by checking a `download_marker` AuditLog row keyed on (userId, resourceId,
 * day). Counter increments only the first time per day. (Audit log table
 * already exists; we just write a structured payload.)
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const r = await prisma.resource.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const dayKey = new Date().toISOString().slice(0, 10)
  const already = await prisma.auditLog.findFirst({
    where: {
      schoolId: session.user.schoolId,
      userId: session.user.id,
      entityType: "Resource",
      entityId: r.id,
      action: `download:${dayKey}`,
    },
    select: { id: true },
  })

  if (already) {
    return NextResponse.json({ ok: true, deduped: true })
  }

  await prisma.$transaction([
    prisma.resource.update({
      where: { id: r.id },
      data: { downloadCount: { increment: 1 } },
    }),
    prisma.auditLog.create({
      data: {
        schoolId: session.user.schoolId,
        userId: session.user.id,
        action: `download:${dayKey}`,
        entityType: "Resource",
        entityId: r.id,
      },
    }),
  ])

  return NextResponse.json({ ok: true, deduped: false })
}
