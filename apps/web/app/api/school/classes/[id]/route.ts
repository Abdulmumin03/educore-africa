import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const klass = await prisma.class.findFirst({
    where: { id: params.id, schoolId: g.session.user.schoolId, deletedAt: null },
  })
  if (!klass) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const enrolled = await prisma.enrollment.count({
    where: { classId: klass.id, isActive: true, deletedAt: null },
  })
  if (enrolled > 0) {
    return NextResponse.json({ error: `Class has ${enrolled} active enrollment(s)` }, { status: 409 })
  }

  await prisma.$transaction([
    prisma.section.updateMany({ where: { classId: klass.id }, data: { deletedAt: new Date() } }),
    prisma.class.update({ where: { id: klass.id }, data: { deletedAt: new Date() } }),
  ])

  return NextResponse.json({ ok: true })
}
