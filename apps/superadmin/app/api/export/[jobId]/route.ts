import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/** Poll one export job. */
export async function GET(request: Request, { params }: { params: { jobId: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const job = await prisma.exportJob.findUnique({
    where: { id: params.jobId },
    select: {
      id: true,
      status: true,
      format: true,
      filename: true,
      rows: true,
      bytes: true,
      error: true,
      expiresAt: true,
      requestedById: true,
      createdAt: true,
      finishedAt: true,
    },
  })
  if (!job) return NextResponse.json({ error: "No such export." }, { status: 404 })

  // An export is a file of cross-tenant data built for one person; another
  // operator can make their own rather than read this one's.
  if (job.requestedById !== guard.user.id && guard.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "That export belongs to someone else." }, { status: 403 })
  }

  const expired = Boolean(job.expiresAt && job.expiresAt <= new Date())

  return NextResponse.json({
    id: job.id,
    status: expired ? "EXPIRED" : job.status,
    filename: job.filename,
    format: job.format,
    rows: job.rows,
    bytes: job.bytes,
    error: job.error,
    downloadUrl: job.status === "READY" && !expired ? `/api/export/${job.id}/download` : null,
    expiresAt: job.expiresAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  })
}
