import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { TRANSPORT_WRITE_ROLES } from "@/lib/transport-helpers"

export const runtime = "nodejs"

/** DELETE /api/transport/assignments/[id] — unassign student from route. */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!TRANSPORT_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const a = await prisma.studentRouteAssignment.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.studentRouteAssignment.update({
    where: { id: a.id },
    data: { isActive: false, deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
