import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(15),
  category: z.enum(["CORE", "ELECTIVE", "TRADE"]),
  creditUnits: z.number().int().min(1).max(10),
  isActive: z.boolean(),
  curriculumIds: z.array(z.string().trim().min(1)).optional(),
})

export async function POST(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })
  const schoolId = g.session.user.schoolId

  // Resolve curricula. Empty / unspecified => fall back to the school's default.
  let curriculumIds = parsed.data.curriculumIds ?? []
  if (curriculumIds.length === 0) {
    const def = await prisma.curriculum.findFirst({
      where: { schoolId, isDefault: true, deletedAt: null },
      select: { id: true },
    })
    if (def) curriculumIds = [def.id]
  } else {
    const found = await prisma.curriculum.findMany({
      where: { schoolId, deletedAt: null, id: { in: curriculumIds } },
      select: { id: true },
    })
    if (found.length !== curriculumIds.length) {
      return NextResponse.json({ error: "Unknown curriculum in selection" }, { status: 422 })
    }
  }

  try {
    const subj = await prisma.$transaction(async (tx) => {
      const created = await tx.subject.create({
        data: {
          schoolId,
          name: parsed.data.name,
          code: parsed.data.code,
          category: parsed.data.category,
          creditUnits: parsed.data.creditUnits,
          isActive: parsed.data.isActive,
          isCore: parsed.data.category === "CORE",
        },
      })
      if (curriculumIds.length > 0) {
        await tx.subjectCurriculum.createMany({
          data: curriculumIds.map((curriculumId) => ({
            subjectId: created.id,
            curriculumId,
          })),
          skipDuplicates: true,
        })
      }
      return created
    })
    return NextResponse.json({ ok: true, id: subj.id })
  } catch {
    return NextResponse.json({ error: "Subject code already exists" }, { status: 409 })
  }
}
