import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    level: z.number().int().min(1).max(99).optional(),
    curriculumId: z.string().trim().min(1).optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined || d.level !== undefined || d.curriculumId !== undefined,
    { message: "Nothing to update" },
  )

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  const klass = await prisma.class.findFirst({
    where: { id: params.id, schoolId: g.session.user.schoolId, deletedAt: null },
  })
  if (!klass) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (parsed.data.name && parsed.data.name !== klass.name) {
    const collision = await prisma.class.findFirst({
      where: {
        schoolId: g.session.user.schoolId,
        name: parsed.data.name,
        deletedAt: null,
        NOT: { id: klass.id },
      },
    })
    if (collision) {
      return NextResponse.json({ error: "Class name already exists" }, { status: 409 })
    }
  }

  if (parsed.data.curriculumId) {
    const cur = await prisma.curriculum.findFirst({
      where: {
        id: parsed.data.curriculumId,
        schoolId: g.session.user.schoolId,
        deletedAt: null,
      },
    })
    if (!cur) return NextResponse.json({ error: "Curriculum not found" }, { status: 422 })
  }

  await prisma.class.update({ where: { id: klass.id }, data: parsed.data })
  return NextResponse.json({ ok: true })
}

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
