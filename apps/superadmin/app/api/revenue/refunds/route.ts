import { NextResponse } from "next/server"
import type { RefundReason, RefundStatus } from "@prisma/client"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { refundMode, requestRefund } from "@/lib/gateways"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const REASONS: RefundReason[] = ["REQUEST", "DUPLICATE", "ERROR", "GOODWILL"]

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const status = new URL(request.url).searchParams.get("status")
  const refunds = await prisma.subscriptionRefund.findMany({
    where: status ? { status: status as RefundStatus } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      originalAmount: true,
      amount: true,
      reason: true,
      status: true,
      note: true,
      gatewaySent: true,
      gatewayRef: true,
      failureReason: true,
      approvedAt: true,
      createdAt: true,
      requestedById: true,
      approvedById: true,
      schoolId: true,
      school: { select: { name: true } },
      transaction: { select: { reference: true, gateway: true } },
    },
  })

  const actorIds = [
    ...new Set(refunds.flatMap((r) => [r.requestedById, r.approvedById].filter(Boolean) as string[])),
  ]
  const actors = await prisma.superAdminUser.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  })
  const byId = new Map(actors.map((a) => [a.id, a.name]))

  return NextResponse.json({
    refunds: refunds.map((refund) => ({
      id: refund.id,
      schoolId: refund.schoolId,
      school: refund.school.name,
      reference: refund.transaction.reference,
      gateway: refund.transaction.gateway,
      originalAmount: Number(refund.originalAmount),
      amount: Number(refund.amount),
      reason: refund.reason,
      status: refund.status,
      note: refund.note,
      gatewaySent: refund.gatewaySent,
      gatewayRef: refund.gatewayRef,
      failureReason: refund.failureReason,
      requestedBy: byId.get(refund.requestedById) ?? "Unknown",
      approvedBy: refund.approvedById ? (byId.get(refund.approvedById) ?? "Unknown") : null,
      approvedAt: refund.approvedAt?.toISOString() ?? null,
      createdAt: refund.createdAt.toISOString(),
    })),
  })
}

/**
 * Raise and approve a refund in one step — the confirmation dialog IS the
 * approval, and only FINANCE_ADMIN or SUPER_ADMIN can reach it.
 */
export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  // Deliberately narrow: refunds move money out.
  const forbidden = requireApiRole(guard.user, "FINANCE_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const transactionId = typeof body.transactionId === "string" ? body.transactionId : ""
  const amount = Number(body.amount)
  const reason = typeof body.reason === "string" ? body.reason : ""
  const note = typeof body.note === "string" ? body.note.trim() : null

  if (!transactionId) return NextResponse.json({ error: "transactionId is required." }, { status: 400 })
  if (!REASONS.includes(reason as RefundReason)) {
    return NextResponse.json({ error: `reason must be one of ${REASONS.join(", ")}` }, { status: 400 })
  }

  const txn = await prisma.subscriptionTransaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      schoolId: true,
      amount: true,
      status: true,
      gateway: true,
      gatewayRef: true,
      reference: true,
      school: { select: { name: true } },
      refunds: { where: { status: { in: ["COMPLETED", "PROCESSING", "APPROVED"] } }, select: { amount: true } },
    },
  })
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 })

  if (txn.status !== "SUCCESSFUL" && txn.status !== "PARTIALLY_REFUNDED") {
    return NextResponse.json(
      { error: "Only a settled charge can be refunded." },
      { status: 409 },
    )
  }

  const original = Number(txn.amount)
  const alreadyRefunded = txn.refunds.reduce((sum, r) => sum + Number(r.amount), 0)
  const remaining = original - alreadyRefunded

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Refund amount must be greater than zero." }, { status: 400 })
  }
  if (amount > remaining + 0.001) {
    return NextResponse.json(
      { error: `Only ${remaining.toFixed(2)} of this charge is still refundable.` },
      { status: 409 },
    )
  }

  const gateway = await requestRefund({
    gateway: txn.gateway,
    gatewayRef: txn.gatewayRef,
    amountKobo: Math.round(amount * 100),
    reason: `${reason}: ${note ?? "no note"}`,
  })

  if (!gateway.ok) {
    const failed = await prisma.subscriptionRefund.create({
      data: {
        transactionId: txn.id,
        schoolId: txn.schoolId,
        originalAmount: original,
        amount,
        reason: reason as RefundReason,
        status: "FAILED",
        note,
        requestedById: guard.user.id,
        failureReason: gateway.error,
      },
      select: { id: true },
    })

    await auditLog({
      userId: guard.user.id,
      action: "revenue.refund.failed",
      target: auditTarget("school", txn.schoolId),
      targetType: "payment",
      ipAddress: guard.ipAddress,
      details: { refundId: failed.id, transactionId: txn.id, amount, error: gateway.error },
    })

    return NextResponse.json({ error: gateway.error, refundId: failed.id }, { status: 502 })
  }

  const totalAfter = alreadyRefunded + amount
  const fullyRefunded = totalAfter >= original - 0.001

  const refund = await prisma.$transaction(async (tx) => {
    const created = await tx.subscriptionRefund.create({
      data: {
        transactionId: txn.id,
        schoolId: txn.schoolId,
        originalAmount: original,
        amount,
        reason: reason as RefundReason,
        // Recorded-only refunds stop at APPROVED; a gateway-settled one completes.
        status: gateway.sent ? "COMPLETED" : "APPROVED",
        note,
        requestedById: guard.user.id,
        approvedById: guard.user.id,
        approvedAt: new Date(),
        gatewaySent: gateway.sent,
        gatewayRef: gateway.sent ? gateway.gatewayRef : null,
      },
    })

    await tx.subscriptionTransaction.update({
      where: { id: txn.id },
      data: { status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    })

    return created
  })

  await auditLog({
    userId: guard.user.id,
    action: "revenue.refund.approve",
    target: auditTarget("school", txn.schoolId),
    targetType: "payment",
    ipAddress: guard.ipAddress,
    details: {
      refundId: refund.id,
      transactionId: txn.id,
      reference: txn.reference,
      school: txn.school.name,
      originalAmount: original,
      refundAmount: amount,
      reason,
      gatewaySent: gateway.sent,
      approver: guard.user.email,
    },
  })

  return NextResponse.json(
    {
      refund: {
        id: refund.id,
        amount,
        status: gateway.sent ? "COMPLETED" : "APPROVED",
        gatewaySent: gateway.sent,
      },
      transactionStatus: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED",
      gatewayNote: gateway.sent ? null : refundMode(txn.gateway).reason,
    },
    { status: 201 },
  )
}
