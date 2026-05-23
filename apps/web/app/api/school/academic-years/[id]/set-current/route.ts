import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const ay = await prisma.academicYear.findFirst({
    where: { id: params.id, schoolId: g.session.user.schoolId, deletedAt: null },
  })
  if (!ay) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.$transaction([
    prisma.academicYear.updateMany({
      where: { schoolId: g.session.user.schoolId, id: { not: ay.id } },
      data: { isCurrent: false },
    }),
    prisma.academicYear.update({ where: { id: ay.id }, data: { isCurrent: true } }),
  ])

  return NextResponse.json({ ok: true })
}
