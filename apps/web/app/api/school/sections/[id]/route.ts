import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const patchSchema = z.object({
  capacity: z.number().int().min(1).max(200).optional(),
  name: z.string().min(1).max(20).optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  const result = await prisma.section.updateMany({
    where: { id: params.id, schoolId: g.session.user.schoolId, deletedAt: null },
    data: parsed.data,
  })
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const section = await prisma.section.findFirst({
    where: { id: params.id, schoolId: g.session.user.schoolId, deletedAt: null },
  })
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const enrolled = await prisma.enrollment.count({
    where: { sectionId: section.id, isActive: true, deletedAt: null },
  })
  if (enrolled > 0) {
    return NextResponse.json({ error: `Arm has ${enrolled} active enrollment(s)` }, { status: 409 })
  }

  await prisma.section.update({ where: { id: section.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
