import { resolveStudentAccess } from "@/lib/student-access"
import { buildReportCardData } from "@/lib/report-card"
import { renderWaecSheetPdf } from "@/lib/waec-sheet-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Mock WAEC / NECO summary sheet PDF. Refuses when the student's class
 * runs a non-WAEC / non-NECO curriculum — Cambridge classes use the
 * /cambridge route instead.
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

  if (
    data.curriculum.examBodyCode !== "WAEC" &&
    data.curriculum.examBodyCode !== "NECO" &&
    data.curriculum.examBodyCode !== "NONE"
  ) {
    return new Response(
      `This class runs the ${data.curriculum.examBodyCode} curriculum, not WAEC/NECO.`,
      { status: 422 },
    )
  }

  const pdf = await renderWaecSheetPdf(data)
  const filename = `waec-mock-${data.student.admissionNumber}-${data.term.sessionName.replace("/", "-")}-${data.term.type}.pdf`
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
