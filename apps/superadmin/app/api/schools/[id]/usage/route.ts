import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const months = Math.min(24, Math.max(1, Number(new URL(request.url).searchParams.get("months") ?? 6)))
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))

  const [snapshots, subscription] = await Promise.all([
    prisma.schoolUsageSnapshot.findMany({
      where: { schoolId: params.id, month: { gte: from } },
      orderBy: { month: "asc" },
      select: {
        month: true,
        apiCalls: true,
        storageMb: true,
        smsSent: true,
        logins: true,
        studentsAdded: true,
        feesProcessed: true,
      },
    }),
    prisma.schoolSubscription.findUnique({
      where: { schoolId: params.id },
      select: { plan: true, seats: true },
    }),
  ])

  const latest = snapshots.at(-1)

  // Storage split is an estimate from the one number we meter, and is
  // labelled as such in the UI rather than presented as measured.
  const storageMb = latest?.storageMb ?? 0
  const storage = [
    { label: "Student photos", mb: Math.round(storageMb * 0.43) },
    { label: "Documents", mb: Math.round(storageMb * 0.36) },
    { label: "E-learning", mb: storageMb - Math.round(storageMb * 0.43) - Math.round(storageMb * 0.36) },
  ]

  return NextResponse.json({
    months: snapshots.map((row) => ({
      month: row.month.toISOString(),
      label: row.month.toLocaleDateString("en-NG", { month: "short", year: "numeric", timeZone: "UTC" }),
      apiCalls: row.apiCalls,
      storageMb: row.storageMb,
      smsSent: row.smsSent,
      logins: row.logins,
      studentsAdded: row.studentsAdded,
      feesProcessed: Number(row.feesProcessed),
    })),
    storage,
    plan: subscription?.plan ?? null,
    seats: subscription?.seats ?? null,
    metered: snapshots.length > 0,
  })
}
