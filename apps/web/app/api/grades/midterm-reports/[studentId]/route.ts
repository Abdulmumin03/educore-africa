import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveStudentAccess } from "@/lib/student-access"
import { resolveGradeAccess } from "@/lib/grade-access"
import { buildMidtermReportData } from "@/lib/midterm-report"
import { renderMidtermReportPdf } from "@/lib/midterm-report-pdf"
import { patchMidtermReportSchema } from "@/lib/grade-schemas"
import { resolveTemplate } from "@/lib/report-template"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/grades/midterm-reports/[studentId]?termId=X&format=json|pdf
 *
 * Returns the midterm report for a student/term. Scores are computed live
 * from Grade.caComponents — only the components listed in the class's
 * curriculum's `midtermComponents` are summed. No letter grades or positions.
 */
export async function GET(req: Request, { params }: { params: { studentId: string } }) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (access.visibility.ids && !access.visibility.ids.includes(params.studentId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const url = new URL(req.url)
  const termId = url.searchParams.get("termId")
  const format = url.searchParams.get("format") ?? "json"
  if (!termId) return NextResponse.json({ error: "termId required" }, { status: 422 })

  const data = await buildMidtermReportData({
    schoolId: access.session.schoolId,
    studentId: params.studentId,
    termId,
  })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (format === "pdf") {
    const template = await resolveTemplate(
      access.session.schoolId,
      "MIDTERM",
      data.curriculum.id,
    )
    const pdf = await renderMidtermReportPdf(data, template)
    const filename = `midterm-${data.student.admissionNumber}-${data.term.sessionName.replace(
      "/",
      "-",
    )}-${data.term.type}.pdf`
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    })
  }

  return NextResponse.json(data)
}

/**
 * PATCH /api/grades/midterm-reports/[studentId]
 *
 * Body: { termId, classTeacherComment?, principalComment? }
 *
 * Upserts the comment fields on the MidtermReport row. Refuses if the row
 * exists and is locked — admin must unlock first. Teacher comment is editable
 * by teachers + privileged roles; principal comment is privileged-only.
 */
export async function PATCH(req: Request, { params }: { params: { studentId: string } }) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = patchMidtermReportSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { termId, classTeacherComment, principalComment } = parsed.data

  if (principalComment !== undefined && !access.isPrivileged) {
    return NextResponse.json(
      { error: "Only principals / admins may edit the principal comment" },
      { status: 403 },
    )
  }

  // Confirm the student belongs to this school.
  const student = await prisma.student.findFirst({
    where: { id: params.studentId, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const existing = await prisma.midtermReport.findUnique({
    where: { studentId_termId: { studentId: params.studentId, termId } },
  })
  if (existing?.lockedAt) {
    return NextResponse.json({ error: "Report is locked" }, { status: 409 })
  }

  const data: Record<string, unknown> = {}
  if (classTeacherComment !== undefined) {
    data.classTeacherComment = classTeacherComment?.trim() || null
  }
  if (principalComment !== undefined) {
    data.principalComment = principalComment?.trim() || null
    data.aiPrincipal = false // human-edited overrides any AI flag
  }

  const row = await prisma.midtermReport.upsert({
    where: { studentId_termId: { studentId: params.studentId, termId } },
    create: {
      schoolId: access.session.schoolId,
      studentId: params.studentId,
      termId,
      generatedById: access.session.userId,
      ...data,
    },
    update: data,
  })

  return NextResponse.json({ ok: true, id: row.id })
}
