import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  category: z.enum(["CORE", "ELECTIVE", "TRADE"]).optional(),
  creditUnits: z.number().int().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
  curriculumIds: z.array(z.string().trim().min(1)).optional(),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })
  const schoolId = g.session.user.schoolId

  const subj = await prisma.subject.findFirst({
    where: { id: params.id, schoolId, deletedAt: null },
  })
  if (!subj) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { curriculumIds, ...rest } = parsed.data
  const data: Record<string, unknown> = { ...rest }
  if (rest.category) data.isCore = rest.category === "CORE"

  if (curriculumIds) {
    if (curriculumIds.length === 0) {
      return NextResponse.json(
        { error: "At least one curriculum required" },
        { status: 422 },
      )
    }
    const found = await prisma.curriculum.findMany({
      where: { schoolId, deletedAt: null, id: { in: curriculumIds } },
      select: { id: true },
    })
    if (found.length !== curriculumIds.length) {
      return NextResponse.json({ error: "Unknown curriculum in selection" }, { status: 422 })
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.subject.update({ where: { id: subj.id }, data })
    }
    if (curriculumIds) {
      await tx.subjectCurriculum.deleteMany({
        where: { subjectId: subj.id, curriculumId: { notIn: curriculumIds } },
      })
      // Inserting only the missing ones avoids creating new rows for pairings
      // that already exist (which would lose their externalCode).
      const existing = await tx.subjectCurriculum.findMany({
        where: { subjectId: subj.id },
        select: { curriculumId: true },
      })
      const have = new Set(existing.map((r) => r.curriculumId))
      const toAdd = curriculumIds.filter((id) => !have.has(id))
      if (toAdd.length > 0) {
        await tx.subjectCurriculum.createMany({
          data: toAdd.map((curriculumId) => ({ subjectId: subj.id, curriculumId })),
          skipDuplicates: true,
        })
      }
    }
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const result = await prisma.subject.updateMany({
    where: { id: params.id, schoolId: g.session.user.schoolId, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
