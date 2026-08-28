import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { executeReport } from "@/lib/report-scheduler"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Run a saved report now, exactly as the scheduler would. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const report = await prisma.reportConfig.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  })
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 })

  const outcome = await executeReport(report.id, "manual")

  await auditLog({
    userId: guard.user.id,
    action: "report.run",
    target: auditTarget("config", `report:${report.id}`),
    targetType: "config",
    ipAddress: guard.ipAddress,
    details: { name: report.name, status: outcome.status, rows: outcome.rows },
  })

  if (outcome.status === "FAILED") {
    return NextResponse.json({ error: outcome.error ?? "The report failed." }, { status: 400 })
  }

  return NextResponse.json({
    runId: outcome.runId,
    rows: outcome.rows,
    durationMs: outcome.durationMs,
    downloadUrl: outcome.delivery?.downloadUrl ?? null,
    storage: outcome.delivery?.storage ?? "none",
    emailed: outcome.delivery?.emailed ?? 0,
    // Every way the run fell short of "sent to everyone" is surfaced, not
    // folded into a success.
    notes: [outcome.delivery?.storageNote, outcome.delivery?.emailSkipped].filter(Boolean),
  })
}
