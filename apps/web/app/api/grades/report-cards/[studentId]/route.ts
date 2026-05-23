import { NextResponse } from "next/server"
import { resolveStudentAccess } from "@/lib/student-access"
import { buildReportCardData } from "@/lib/report-card"
import { renderReportCardPdf } from "@/lib/report-card-pdf"
import { resolveTemplate } from "@/lib/report-template"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

  const data = await buildReportCardData({
    schoolId: access.session.schoolId,
    studentId: params.studentId,
    termId,
  })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (format === "pdf") {
    const template = await resolveTemplate(
      access.session.schoolId,
      "GRADE",
      data.curriculum.id,
    )
    const pdf = await renderReportCardPdf(data, template)
    const filename = `report-card-${data.student.admissionNumber}-${data.term.sessionName.replace("/", "-")}-${data.term.type}.pdf`
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
