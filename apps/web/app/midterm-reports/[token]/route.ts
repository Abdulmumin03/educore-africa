import { prisma } from "@/lib/db"
import { buildMidtermReportData } from "@/lib/midterm-report"
import { renderMidtermReportPdf } from "@/lib/midterm-report-pdf"
import { resolveTemplate } from "@/lib/report-template"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Public, unauthenticated PDF download via shareable token. Tracks accesses
 * so admins can see how many times the parent opened it.
 *
 * NOTE: this lives at /midterm-reports/[token]/route.ts (a route handler
 * under /midterm-reports, NOT /api/...) so the URL is friendly for SMS and
 * the middleware's PUBLIC_PREFIXES allowlist passes /midterm-reports
 * through. Mirrors the term-end /report-cards/[token] pattern.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const share = await prisma.midtermReportShare.findUnique({
    where: { token: params.token },
    include: {
      midtermReport: {
        select: { id: true, schoolId: true, studentId: true, termId: true },
      },
    },
  })
  if (!share) return new Response("Not found", { status: 404 })
  if (share.expiresAt.getTime() < Date.now()) return new Response("Link expired", { status: 410 })

  const data = await buildMidtermReportData({
    schoolId: share.midtermReport.schoolId,
    studentId: share.midtermReport.studentId,
    termId: share.midtermReport.termId,
  })
  if (!data) return new Response("Not found", { status: 404 })

  await prisma.midtermReportShare.update({
    where: { id: share.id },
    data: { accesses: { increment: 1 }, lastAccessAt: new Date() },
  })

  const template = await resolveTemplate(
    share.midtermReport.schoolId,
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
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
