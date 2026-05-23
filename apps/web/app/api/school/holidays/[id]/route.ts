import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const result = await prisma.holiday.updateMany({
    where: { id: params.id, schoolId: g.session.user.schoolId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
