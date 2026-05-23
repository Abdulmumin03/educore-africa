import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"
import {
  gradeTemplateConfigSchema,
  midtermTemplateConfigSchema,
  type ReportTemplateConfig,
} from "@/lib/report-template"
import { buildReportCardData } from "@/lib/report-card"
import { buildMidtermReportData } from "@/lib/midterm-report"
import { renderReportCardPdf } from "@/lib/report-card-pdf"
import { renderMidtermReportPdf } from "@/lib/midterm-report-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  kind: z.enum(["GRADE", "MIDTERM"]),
  config: z.unknown(),
  studentId: z.string().cuid().optional(),
  termId: z.string().cuid().optional(),
})

/**
 * POST /api/school/report-templates/preview
 *
 * Body: { kind, config, studentId?, termId? }
 *
 * Renders a sample PDF using the supplied (often unsaved) config. When
 * studentId / termId are omitted, picks the first active student in the
 * school and the current term so admins can preview without thinking about
 * which row to render against.
 */
export async function POST(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid" },
      { status: 422 },
    )
  }
  const schoolId = g.session.user.schoolId
  const { kind, config, studentId: rawStudentId, termId: rawTermId } = parsed.data

  const schema =
    kind === "GRADE" ? gradeTemplateConfigSchema : midtermTemplateConfigSchema
  const cfg = schema.safeParse(config)
  if (!cfg.success) {
    return NextResponse.json(
      { error: cfg.error.issues[0]?.message ?? "Invalid config" },
      { status: 422 },
    )
  }
  const template = cfg.data as ReportTemplateConfig

  // Resolve student.
  let studentId = rawStudentId
  if (!studentId) {
    const first = await prisma.enrollment.findFirst({
      where: {
        schoolId,
        isActive: true,
        deletedAt: null,
        student: { status: "ACTIVE", deletedAt: null },
      },
      orderBy: { enrolledOn: "desc" },
      select: { studentId: true },
    })
    studentId = first?.studentId
  }
  if (!studentId) {
    return NextResponse.json(
      { error: "No active students in this school — enrol someone first." },
      { status: 422 },
    )
  }

  // Resolve term.
  let termId = rawTermId
  if (!termId) {
    const term = await prisma.term.findFirst({
      where: {
        isCurrent: true,
        academicYear: { schoolId },
      },
      select: { id: true },
    })
    termId =
      term?.id ??
      (
        await prisma.term.findFirst({
          where: { academicYear: { schoolId } },
          orderBy: { startDate: "desc" },
          select: { id: true },
        })
      )?.id
  }
  if (!termId) {
    return NextResponse.json(
      { error: "No term configured for this school." },
      { status: 422 },
    )
  }

  if (kind === "GRADE") {
    const data = await buildReportCardData({ schoolId, studentId, termId })
    if (!data) {
      return NextResponse.json(
        { error: "Couldn't build sample data — the student may not be enrolled." },
        { status: 404 },
      )
    }
    const pdf = await renderReportCardPdf(data, template)
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="template-preview-grade.pdf"`,
        "cache-control": "no-store",
      },
    })
  }

  const data = await buildMidtermReportData({ schoolId, studentId, termId })
  if (!data) {
    return NextResponse.json(
      { error: "Couldn't build sample data — the student may not be enrolled." },
      { status: 404 },
    )
  }
  const pdf = await renderMidtermReportPdf(data, template)
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="template-preview-midterm.pdf"`,
      "cache-control": "no-store",
    },
  })
}
