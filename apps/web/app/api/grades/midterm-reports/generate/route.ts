import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveGradeAccess } from "@/lib/grade-access"
import { generateMidtermReportSchema } from "@/lib/grade-schemas"

export const runtime = "nodejs"

/**
 * POST /api/grades/midterm-reports/generate
 *
 * Body: { classId, sectionId?, termId }
 *
 * Upserts a blank MidtermReport row for every active student in the target
 * scope so teachers can immediately edit comments. Locked rows are left
 * untouched. No score computation — midterm scores are always live off
 * Grade.caComponents. Idempotent.
 */
export async function POST(req: Request) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response
  if (!access.isPrivileged && !access.canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = generateMidtermReportSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { classId, sectionId, termId } = parsed.data

  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolId: access.session.schoolId,
      isActive: true,
      deletedAt: null,
      student: { status: "ACTIVE", deletedAt: null },
      ...(sectionId ? { sectionId } : { section: { classId } }),
    },
    select: { studentId: true },
  })

  if (enrollments.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, skipped: 0, message: "No active students" })
  }

  // Existing rows so we can skip locked ones and avoid touching comments.
  const existing = await prisma.midtermReport.findMany({
    where: {
      studentId: { in: enrollments.map((e) => e.studentId) },
      termId,
    },
    select: { studentId: true, lockedAt: true },
  })
  const existingByStudent = new Map(existing.map((r) => [r.studentId, r]))

  let generated = 0
  let skipped = 0

  for (const e of enrollments) {
    const prior = existingByStudent.get(e.studentId)
    if (prior?.lockedAt) {
      skipped += 1
      continue
    }
    if (prior) {
      // Row exists, not locked — touch updatedAt so the UI knows it's still active.
      await prisma.midtermReport.update({
        where: { studentId_termId: { studentId: e.studentId, termId } },
        data: { generatedById: access.session.userId },
      })
    } else {
      await prisma.midtermReport.create({
        data: {
          schoolId: access.session.schoolId,
          studentId: e.studentId,
          termId,
          generatedById: access.session.userId,
        },
      })
    }
    generated += 1
  }

  return NextResponse.json({
    ok: true,
    generated,
    skipped,
    total: enrollments.length,
  })
}
