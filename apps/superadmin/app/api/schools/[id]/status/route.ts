import { NextResponse } from "next/server"
import type { SubscriptionStatus } from "@prisma/client"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { monthlyAmount } from "@/lib/metrics"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const ALLOWED: SubscriptionStatus[] = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CHURNED"]

/** Activate, suspend or deactivate a school. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "BUSINESS_ADMIN", "FINANCE_ADMIN")
  if (forbidden) return forbidden

  let body: { status?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const status = typeof body.status === "string" ? body.status : ""
  const reason = typeof body.reason === "string" ? body.reason.trim() : ""

  if (!ALLOWED.includes(status as SubscriptionStatus)) {
    return NextResponse.json({ error: `status must be one of ${ALLOWED.join(", ")}` }, { status: 400 })
  }

  const existing = await prisma.schoolSubscription.findUnique({
    where: { schoolId: params.id },
    select: { id: true, status: true, plan: true, amount: true, cycle: true },
  })
  if (!existing) {
    return NextResponse.json({ error: "This school has no subscription." }, { status: 404 })
  }

  const next = status as SubscriptionStatus
  const ending = next === "CHURNED" || next === "SUSPENDED"

  const updated = await prisma.$transaction(async (tx) => {
    const subscription = await tx.schoolSubscription.update({
      where: { schoolId: params.id },
      data: {
        status: next,
        cancelledAt: next === "CHURNED" ? new Date() : null,
        churnReason: next === "CHURNED" ? reason || null : null,
      },
    })
    // School.isActive gates the school's own app, so it has to follow.
    await tx.school.update({
      where: { id: params.id },
      data: { isActive: !ending },
    })

    // Churn and reactivation move MRR, so they belong in the revision history
    // alongside plan and price changes.
    const wasChurned = existing.status === "CHURNED"
    if (next === "CHURNED" || (wasChurned && next === "ACTIVE")) {
      await tx.subscriptionRevision.create({
        data: {
          subscriptionId: existing.id,
          schoolId: params.id,
          kind: next === "CHURNED" ? "CHURN" : "REACTIVATION",
          fromPlan: existing.plan,
          toPlan: existing.plan,
          fromMonthly: monthlyAmount(Number(existing.amount), existing.cycle),
          toMonthly: next === "CHURNED" ? 0 : monthlyAmount(Number(existing.amount), existing.cycle),
          effectiveAt: new Date(),
          actorId: guard.user.id,
          note: reason || null,
        },
      })
    }

    return subscription
  })

  await auditLog({
    userId: guard.user.id,
    action: `school.status.${next.toLowerCase()}`,
    target: auditTarget("school", params.id),
    targetType: "school",
    ipAddress: guard.ipAddress,
    details: { from: existing.status, to: next, reason: reason || null },
  })

  return NextResponse.json({ subscription: updated })
}
