import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_ADMIN_ROLES } from "@/lib/hostel-helpers"

export const runtime = "nodejs"

/** DELETE /api/hostel/dorms/[id] — soft delete; rooms become unassigned (dormId → null). */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!HOSTEL_ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const d = await prisma.hostelDorm.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      hostel: { schoolId: session.user.schoolId, deletedAt: null },
    },
    select: { id: true },
  })
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Rooms' onDelete=SetNull handles dormId; we just soft-delete the dorm row.
  await prisma.hostelDorm.update({
    where: { id: d.id },
    data: { deletedAt: new Date() },
  })
  // Detach the rooms so they don't link to a deleted dorm.
  await prisma.hostelRoom.updateMany({
    where: { dormId: d.id },
    data: { dormId: null },
  })
  return NextResponse.json({ ok: true })
}
