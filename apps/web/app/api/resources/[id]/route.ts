import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

/** DELETE /api/resources/[id] — uploader or admin. Soft delete. */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const r = await prisma.resource.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true, uploaderId: true },
  })
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAdmin = ADMIN_ROLES.includes(session.user.role)
  const isOwner = r.uploaderId === session.user.id
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.resource.update({
    where: { id: r.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
