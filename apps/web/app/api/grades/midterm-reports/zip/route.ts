import { z } from "zod"
import JSZip from "jszip"
import { prisma } from "@/lib/db"
import { resolveGradeAccess } from "@/lib/grade-access"
import { buildMidtermReportData } from "@/lib/midterm-report"
import { renderMidtermReportPdf } from "@/lib/midterm-report-pdf"
import { resolveTemplate, type ReportTemplateConfig } from "@/lib/report-template"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// Bulk PDF rendering is CPU-heavy; allow up to 5 minutes.
export const maxDuration = 300

const querySchema = z.object({
  classId: z.string().cuid(),
  sectionId: z.string().cuid().optional(),
  termId: z.string().cuid(),
})

/**
 * Stream a ZIP of midterm-report PDFs for every active student in the chosen
 * class/section + term. Mirrors the term-end report-card ZIP route.
 */
export async function POST(req: Request) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return new Response("Forbidden", { status: 403 })

  const parsed = querySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new Response("Validation failed", { status: 422 })
  const { classId, sectionId, termId } = parsed.data

  const enrollments = await prisma.enrollment.findMany({
    where: {
      schoolId: access.session.schoolId,
      isActive: true,
      deletedAt: null,
      student: { status: "ACTIVE", deletedAt: null },
      ...(sectionId ? { sectionId } : { section: { classId } }),
    },
    include: {
      student: {
        select: {
          id: true,
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      section: { select: { name: true, class: { select: { name: true } } } },
    },
    orderBy: { student: { user: { lastName: "asc" } } },
  })

  if (enrollments.length === 0) {
    return new Response("No students in this class/section", { status: 404 })
  }

  const zip = new JSZip()
  const term = await prisma.term.findUnique({
    where: { id: termId },
    include: { academicYear: { select: { name: true } } },
  })
  const termLabel = term
    ? `${term.academicYear.name.replace("/", "-")}-${term.type}`
    : termId
  const folderName = sectionId
    ? `midterm-${enrollments[0]?.section.class.name}-Arm${enrollments[0]?.section.name}-${termLabel}`
    : `midterm-${enrollments[0]?.section.class.name}-${termLabel}`
  const folder = zip.folder(folderName)!

  const skipped: string[] = []
  const templateCache = new Map<string | "null", ReportTemplateConfig>()

  // Sequential render to keep memory bounded — @react-pdf/renderer holds the
  // full doc in memory per render.
  for (const e of enrollments) {
    const data = await buildMidtermReportData({
      schoolId: access.session.schoolId,
      studentId: e.student.id,
      termId,
    })
    if (!data) {
      skipped.push(e.student.admissionNumber)
      continue
    }
    const cacheKey = data.curriculum.id ?? "null"
    let template = templateCache.get(cacheKey)
    if (!template) {
      template = await resolveTemplate(
        access.session.schoolId,
        "MIDTERM",
        data.curriculum.id,
      )
      templateCache.set(cacheKey, template)
    }
    const pdf = await renderMidtermReportPdf(data, template)
    const safeName = `${e.student.user.lastName}_${e.student.user.firstName}`.replace(
      /[^a-z0-9_-]/gi,
      "",
    )
    folder.file(`${safeName}-${e.student.admissionNumber}.pdf`, pdf)
  }

  const zipBuf = await zip.generateAsync({ type: "nodebuffer" })

  return new Response(new Uint8Array(zipBuf), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${folderName}.zip"`,
      "cache-control": "no-store",
      "x-skipped-count": String(skipped.length),
    },
  })
}
