import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const term = await prisma.term.findFirst({
    where: { id: params.id, academicYear: { schoolId: g.session.user.schoolId } },
    include: { academicYear: true },
  })
  if (!term) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.$transaction([
    prisma.term.updateMany({
      where: { academicYearId: term.academicYearId, id: { not: term.id } },
      data: { isCurrent: false },
    }),
    prisma.term.update({ where: { id: term.id }, data: { isCurrent: true } }),
  ])

  return NextResponse.json({ ok: true })
}
