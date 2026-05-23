import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveGradeAccess, teacherCanGrade } from "@/lib/grade-access"
import { getGradingConfig, letterGradeFor, totalCaFrom } from "@/lib/grade-config"
import { patchGradeSchema } from "@/lib/grade-schemas"

export const runtime = "nodejs"

/**
 * Auto-save endpoint for the spreadsheet UI. Updates one cell + recomputes
 * total + letter grade. Doesn't recompute position — that's done at bulk-save
 * time to keep this call cheap.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const existing = await prisma.grade.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    include: {
      student: {
        include: {
          enrollments: {
            where: { isActive: true, deletedAt: null },
            take: 1,
            select: { sectionId: true },
          },
        },
      },
    },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const sectionId = existing.student.enrollments[0]?.sectionId
  if (!sectionId) {
    return NextResponse.json({ error: "Student not enrolled" }, { status: 409 })
  }

  const allowed = await teacherCanGrade({
    schoolId: access.session.schoolId,
    staffId: access.teacherStaffId,
    subjectId: existing.subjectId,
    sectionId,
    isPrivileged: access.isPrivileged,
  })
  if (!allowed) return NextResponse.json({ error: "Not assigned to this subject" }, { status: 403 })

  const parsed = patchGradeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 })

  const config = await getGradingConfig({
    schoolId: access.session.schoolId,
    sectionId,
  })

  // Merge incoming component patch with whatever's already stored.
  const currentComponents =
    (existing.caComponents as Record<string, number> | null | undefined) ?? null
  const mergedComponents = parsed.data.caComponents
    ? { ...(currentComponents ?? {}), ...parsed.data.caComponents }
    : currentComponents
  const caScore = totalCaFrom(mergedComponents, config.caComponents)
  const examScore =
    typeof parsed.data.examScore === "number" ? parsed.data.examScore : existing.examScore
  const totalScore = Math.round((caScore + examScore) * 10) / 10
  const lg = letterGradeFor(totalScore, config.scale)

  const updated = await prisma.grade.update({
    where: { id: existing.id },
    data: {
      caComponents: mergedComponents ?? Prisma.JsonNull,
      caScore,
      examScore,
      totalScore,
      letterGrade: lg?.grade ?? null,
      teacherRemark:
        parsed.data.teacherRemark === undefined
          ? undefined
          : parsed.data.teacherRemark || null,
      recordedById: access.teacherStaffId ?? undefined,
    },
    select: {
      id: true,
      caScore: true,
      examScore: true,
      totalScore: true,
      letterGrade: true,
      caComponents: true,
      teacherRemark: true,
    },
  })

  return NextResponse.json({ ok: true, grade: updated })
}
