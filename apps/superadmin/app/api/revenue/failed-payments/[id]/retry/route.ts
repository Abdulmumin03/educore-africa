import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { isLive } from "@/lib/gateways"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/**
 * Re-attempt a failed charge.
 *
 * Charging a card is a money movement, so this does NOT call a gateway unless
 * the same explicit switch that governs refunds is on. Otherwise it records
 * the attempt and moves the charge back to PENDING for the billing job to
 * pick up — never silently pretending a card was charged.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "FINANCE_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  const txn = await prisma.subscriptionTransaction.findUnique({
    where: { id: params.id },
    select: { id: true, schoolId: true, status: true, attempts: true, amount: true, gateway: true },
  })
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
  if (txn.status !== "FAILED") {
    return NextResponse.json({ error: "Only failed charges can be retried." }, { status: 409 })
  }

  const updated = await prisma.subscriptionTransaction.update({
    where: { id: txn.id },
    data: {
      status: "PENDING",
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
      failureReason: null,
    },
    select: { id: true, status: true, attempts: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "revenue.payment.retry",
    target: auditTarget("school", txn.schoolId),
    targetType: "payment",
    ipAddress: guard.ipAddress,
    details: {
      transactionId: txn.id,
      attempt: updated.attempts,
      gateway: txn.gateway,
      queuedOnly: !isLive(),
    },
  })

  return NextResponse.json({
    ok: true,
    transaction: updated,
    queuedOnly: !isLive(),
    note: isLive()
      ? "Queued for the billing job to charge."
      : "Queued only — REFUNDS_LIVE is off, so no card was charged.",
  })
}
