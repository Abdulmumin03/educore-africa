import { prisma } from "@/lib/db"
import { buildReportCardData } from "@/lib/report-card"
import { renderReportCardPdf } from "@/lib/report-card-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Public, unauthenticated PDF download via shareable token. Tracks accesses
 * so admins can see how many times the parent opened it.
 *
 * NOTE: this lives at /report-cards/[token]/route.ts (a route handler under
 * /report-cards, NOT /api/report-cards) so the URL is friendly for SMS and
 * the middleware's PUBLIC_PREFIXES allowlist passes /report-cards through
 * via its empty-rule fall-through (no auth check on non-/api paths that aren't
 * /dashboard).
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const share = await prisma.reportCardShare.findUnique({
    where: { token: params.token },
    include: { reportCard: { select: { id: true, schoolId: true, studentId: true, termId: true } } },
  })
  if (!share) return new Response("Not found", { status: 404 })
  if (share.expiresAt.getTime() < Date.now()) return new Response("Link expired", { status: 410 })

  const data = await buildReportCardData({
    schoolId: share.reportCard.schoolId,
    studentId: share.reportCard.studentId,
    termId: share.reportCard.termId,
  })
  if (!data) return new Response("Not found", { status: 404 })

  await prisma.reportCardShare.update({
    where: { id: share.id },
    data: { accesses: { increment: 1 }, lastAccessAt: new Date() },
  })

  const pdf = await renderReportCardPdf(data)
  const filename = `report-card-${data.student.admissionNumber}-${data.term.sessionName.replace("/", "-")}-${data.term.type}.pdf`
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
