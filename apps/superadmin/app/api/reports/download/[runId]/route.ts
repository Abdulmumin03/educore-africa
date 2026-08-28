import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { readStoredFile } from "@/lib/report-scheduler"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/**
 * Serve a generated report held in Redis.
 *
 * Session-guarded, unlike an S3 presigned URL: the fallback path has no
 * signature of its own, so the console's own auth is what protects it. That
 * means an emailed link only works for somebody who can already sign in —
 * which is the correct trade for a file full of cross-tenant data.
 */
export async function GET(request: Request, { params }: { params: { runId: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const run = await prisma.reportRunLog.findUnique({
    where: { id: params.runId },
    select: { id: true, expiresAt: true, config: { select: { name: true } } },
  })
  if (!run) return NextResponse.json({ error: "That report run does not exist." }, { status: 404 })

  if (run.expiresAt && run.expiresAt <= new Date()) {
    return NextResponse.json(
      { error: "This download expired. Run the report again to generate a fresh file." },
      { status: 410 },
    )
  }

  const buffer = await readStoredFile(run.id)
  if (!buffer) {
    return NextResponse.json(
      { error: "The file is no longer stored. Run the report again to generate a fresh one." },
      { status: 410 },
    )
  }

  const slug =
    run.config.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report"

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slug}.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
