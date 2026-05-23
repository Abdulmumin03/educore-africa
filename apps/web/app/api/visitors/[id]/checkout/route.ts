import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const STAFF_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "LIBRARIAN",
  "HOSTEL_MASTER",
]

/** PATCH /api/visitors/[id]/checkout — stamp the check-out time. */
export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!STAFF_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const v = await prisma.visitorLog.findFirst({
    where: {
      id: params.id,
      schoolId: session.user.schoolId,
      deletedAt: null,
    },
    select: { id: true, checkedOutAt: true },
  })
  if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (v.checkedOutAt) {
    return NextResponse.json(
      { error: "Already checked out." },
      { status: 409 },
    )
  }

  await prisma.visitorLog.update({
    where: { id: v.id },
    data: { checkedOutAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
