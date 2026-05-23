import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveGradeAccess } from "@/lib/grade-access"
import { buildReportCardData } from "@/lib/report-card"
import { generateReportCardSchema } from "@/lib/grade-schemas"
import { anthropic } from "@/lib/ai"

export const runtime = "nodejs"

const PRINCIPAL_MODEL = "claude-sonnet-4-6"
const PRINCIPAL_SYSTEM = `You are a Nigerian K-12 school principal writing the final comment on a student's term report card. Write 2-3 sentences (45-75 words). Tone: warm, parental, slightly formal. Acknowledge overall performance, name 1-2 strong subjects by name, name 1 area for growth by name if below 50%, close with an encouraging note. Reference position/class only if provided. No markdown, no sign-off.`

async function generatePrincipalComment(payload: string): Promise<{ text: string | null; model: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: null, model: "skipped" }
  }
  try {
    const res = await anthropic.messages.create({
      model: PRINCIPAL_MODEL,
      max_tokens: 220,
      system: PRINCIPAL_SYSTEM,
      messages: [{ role: "user", content: payload }],
    })
    const text = res.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
    return { text, model: PRINCIPAL_MODEL }
  } catch (err) {
    console.error("[reportCards/generate] AI principal failed", err)
    return { text: null, model: PRINCIPAL_MODEL }
  }
}

/**
 * Generates / refreshes ReportCard rows for every student in a class+term.
 * Caches the principal AI comment (and other denormalised totals) on each row
 * so subsequent PDF renders are fast and consistent. Idempotent — re-running
 * updates existing rows.
 */
export async function POST(req: Request) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response
  if (!access.isPrivileged && !access.canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = generateReportCardSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { classId, sectionId, termId, withAiPrincipal } = parsed.data

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

  let generated = 0
  let skipped = 0
  const errors: Array<{ studentId: string; reason: string }> = []

  for (const e of enrollments) {
    try {
      const data = await buildReportCardData({
        schoolId: access.session.schoolId,
        studentId: e.studentId,
        termId,
      })
      if (!data) {
        skipped += 1
        continue
      }

      // Skip locked report cards — admin must unlock first.
      const existing = await prisma.reportCard.findUnique({
        where: { studentId_termId: { studentId: e.studentId, termId } },
      })
      if (existing?.lockedAt) {
        skipped += 1
        continue
      }

      let principalComment = existing?.principalComment ?? null
      let aiPrincipal = existing?.aiPrincipal ?? false
      if (withAiPrincipal && !principalComment) {
        const lines = [
          `Student: ${data.student.firstName} ${data.student.lastName}`,
          `Class: ${data.student.className} · Arm ${data.student.sectionName}`,
          `Overall average: ${data.totals.average}%`,
          data.totals.overallPosition
            ? `Position: ${data.totals.overallPosition} of ${data.totals.positionOutOf}`
            : "",
          data.attendance.percent != null ? `Attendance: ${data.attendance.percent}%` : "",
          `Subjects (score · grade):`,
          ...data.subjects.map(
            (s) => `  - ${s.name}: ${s.total}${s.letterGrade ? ` · ${s.letterGrade}` : ""}`,
          ),
        ].filter(Boolean)
        const ai = await generatePrincipalComment(lines.join("\n"))
        if (ai.text) {
          principalComment = ai.text
          aiPrincipal = true
        }
      }

      await prisma.reportCard.upsert({
        where: { studentId_termId: { studentId: e.studentId, termId } },
        create: {
          schoolId: access.session.schoolId,
          studentId: e.studentId,
          termId,
          principalComment,
          aiPrincipal,
          classTeacherComment: existing?.classTeacherComment ?? null,
          totalScore: data.totals.total,
          averageScore: data.totals.average,
          position: data.totals.overallPosition,
          positionOutOf: data.totals.positionOutOf,
          daysPresent: data.attendance.present + data.attendance.late,
          schoolDays: data.attendance.schoolDays,
          generatedById: access.session.userId,
        },
        update: {
          principalComment,
          aiPrincipal,
          totalScore: data.totals.total,
          averageScore: data.totals.average,
          position: data.totals.overallPosition,
          positionOutOf: data.totals.positionOutOf,
          daysPresent: data.attendance.present + data.attendance.late,
          schoolDays: data.attendance.schoolDays,
          generatedById: access.session.userId,
        },
      })
      generated += 1
    } catch (err) {
      errors.push({
        studentId: e.studentId,
        reason: err instanceof Error ? err.message : "Unknown",
      })
    }
  }

  return NextResponse.json({
    ok: true,
    generated,
    skipped,
    errors,
    total: enrollments.length,
  })
}
