import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const schema = z.object({
  name: z.string().trim().min(1).max(40),
  level: z.number().int().min(1).max(99),
  curriculumId: z.string().trim().min(1).optional(),
})

export async function POST(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })
  const schoolId = g.session.user.schoolId

  const existing = await prisma.class.findFirst({
    where: { schoolId, name: parsed.data.name, deletedAt: null },
  })
  if (existing) return NextResponse.json({ error: "Class name already exists" }, { status: 409 })

  let curriculumId = parsed.data.curriculumId
  if (curriculumId) {
    const cur = await prisma.curriculum.findFirst({
      where: { id: curriculumId, schoolId, deletedAt: null },
    })
    if (!cur) return NextResponse.json({ error: "Curriculum not found" }, { status: 422 })
  } else {
    const def = await prisma.curriculum.findFirst({
      where: { schoolId, isDefault: true, deletedAt: null },
      select: { id: true },
    })
    if (!def) {
      return NextResponse.json(
        { error: "No default curriculum — create one in Settings → Curricula first" },
        { status: 422 },
      )
    }
    curriculumId = def.id
  }

  const klass = await prisma.class.create({
    data: {
      schoolId,
      name: parsed.data.name,
      level: parsed.data.level,
      curriculumId,
    },
  })
  return NextResponse.json({ ok: true, id: klass.id })
}
