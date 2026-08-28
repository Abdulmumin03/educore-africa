import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const report = await prisma.reportConfig.findUnique({
    where: { id: params.id },
    include: {
      runs: {
        orderBy: { startedAt: "desc" },
        take: 20,
      },
    },
  })
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 })

  return NextResponse.json({
    report: {
      ...report,
      lastRunAt: report.lastRunAt?.toISOString() ?? null,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
      runs: report.runs.map((run) => ({
        ...run,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        expiresAt: run.expiresAt?.toISOString() ?? null,
      })),
    },
  })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "BUSINESS_ADMIN", "ANALYTICS_ADMIN", "FINANCE_ADMIN")
  if (forbidden) return forbidden

  const report = await prisma.reportConfig.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, createdById: true, schedule: true },
  })
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 })

  // Anyone can run a saved report; only its author or a SUPER_ADMIN can remove
  // it, because a scheduled report other people rely on should not vanish
  // because somebody was tidying up.
  if (report.createdById !== guard.user.id && guard.user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only the report's author or a SUPER_ADMIN can delete it." },
      { status: 403 },
    )
  }

  await prisma.reportConfig.delete({ where: { id: report.id } })

  await auditLog({
    userId: guard.user.id,
    action: "report.delete",
    target: auditTarget("config", `report:${report.id}`),
    targetType: "config",
    ipAddress: guard.ipAddress,
    details: { name: report.name, schedule: report.schedule },
  })

  return NextResponse.json({ ok: true })
}
