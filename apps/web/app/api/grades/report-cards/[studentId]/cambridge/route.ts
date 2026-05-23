import { resolveStudentAccess } from "@/lib/student-access"
import { buildReportCardData } from "@/lib/report-card"
import { renderCambridgeSheetPdf } from "@/lib/cambridge-sheet-pdf"
import { resolveCurriculumForClass, getDefaultCurriculum } from "@/lib/curriculum"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Mock Cambridge IGCSE / Checkpoint / A-Level summary sheet PDF. Resolves the
 * curriculum from the student's class. Falls back to the school's default
 * curriculum if the class has no explicit curriculum tag. Returns 422 if
 * the resolved curriculum isn't Cambridge-flavoured.
 */
export async function GET(req: Request, { params }: { params: { studentId: string } }) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (access.visibility.ids && !access.visibility.ids.includes(params.studentId)) {
    return new Response("Not found", { status: 404 })
  }

  const url = new URL(req.url)
  const termId = url.searchParams.get("termId")
  if (!termId) return new Response("termId required", { status: 422 })

  const data = await buildReportCardData({
    schoolId: access.session.schoolId,
    studentId: params.studentId,
    termId,
  })
  if (!data) return new Response("Not found", { status: 404 })

  // Resolve the curriculum off the student's active enrollment.
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      studentId: params.studentId,
      isActive: true,
      deletedAt: null,
    },
    select: { classId: true },
  })

  const curriculum = enrollment
    ? await resolveCurriculumForClass(enrollment.classId)
    : await getDefaultCurriculum(access.session.schoolId)

  if (!curriculum) {
    return new Response("No curriculum configured for this class", { status: 422 })
  }
  if (curriculum.examBodyCode !== "CAMBRIDGE") {
    return new Response(
      `This class is under the ${curriculum.examBodyCode} exam body, not Cambridge.`,
      { status: 422 },
    )
  }

  // Map each subject in the report to its external code under this curriculum.
  const subjectIds = data.subjects.map((s) => s.id)
  const codeRows = await prisma.subjectCurriculum.findMany({
    where: { curriculumId: curriculum.id, subjectId: { in: subjectIds } },
    select: { subjectId: true, externalCode: true },
  })
  const externalCodeBySubjectId: Record<string, string | null> = {}
  for (const r of codeRows) externalCodeBySubjectId[r.subjectId] = r.externalCode

  const pdf = await renderCambridgeSheetPdf({
    data,
    curriculum,
    externalCodeBySubjectId,
  })
  const filename = `cambridge-mock-${data.student.admissionNumber}-${data.term.sessionName.replace("/", "-")}-${data.term.type}.pdf`
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
