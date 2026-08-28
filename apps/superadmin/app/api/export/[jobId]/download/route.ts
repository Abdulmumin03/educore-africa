import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { readExportFile } from "@/lib/export-jobs"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const MIME: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  html: "text/html; charset=utf-8",
}

export async function GET(request: Request, { params }: { params: { jobId: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const job = await prisma.exportJob.findUnique({
    where: { id: params.jobId },
    select: { id: true, status: true, format: true, filename: true, expiresAt: true, requestedById: true },
  })
  if (!job) return NextResponse.json({ error: "No such export." }, { status: 404 })

  if (job.requestedById !== guard.user.id && guard.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "That export belongs to someone else." }, { status: 403 })
  }
  if (job.status !== "READY") {
    return NextResponse.json({ error: `That export is ${job.status.toLowerCase()}.` }, { status: 409 })
  }
  if (job.expiresAt && job.expiresAt <= new Date()) {
    return NextResponse.json({ error: "That export expired. Run it again." }, { status: 410 })
  }

  const buffer = await readExportFile(job.id)
  if (!buffer) {
    return NextResponse.json({ error: "The file is gone. Run the export again." }, { status: 410 })
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME[job.format] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${job.filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
