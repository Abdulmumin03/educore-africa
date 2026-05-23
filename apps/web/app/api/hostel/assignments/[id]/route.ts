import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_WRITE_ROLES } from "@/lib/hostel-helpers"

export const runtime = "nodejs"

/**
 * DELETE /api/hostel/assignments/[id] — check out a student (sets toDate).
 * Keeps the row for history; doesn't delete.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!HOSTEL_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const a = await prisma.hostelAssignment.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      toDate: null,
      room: { hostel: { schoolId: session.user.schoolId } },
    },
    select: { id: true },
  })
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.hostelAssignment.update({
    where: { id: a.id },
    data: { toDate: new Date() },
  })
  return NextResponse.json({ ok: true })
}
