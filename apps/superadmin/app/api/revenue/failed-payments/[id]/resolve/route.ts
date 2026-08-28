import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/** Mark a failed charge as dealt with, optionally recording it as collected. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "FINANCE_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  let markPaid = false
  let note: string | null = null
  try {
    const body = (await request.json()) as { markPaid?: unknown; note?: unknown }
    markPaid = body.markPaid === true
    if (typeof body.note === "string" && body.note.trim()) note = body.note.trim()
  } catch {
    // Both fields optional.
  }

  const txn = await prisma.subscriptionTransaction.findUnique({
    where: { id: params.id },
    select: { id: true, schoolId: true, status: true, amount: true },
  })
  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 })

  const updated = await prisma.subscriptionTransaction.update({
    where: { id: txn.id },
    data: {
      resolvedAt: new Date(),
      resolvedById: guard.user.id,
      ...(markPaid ? { status: "SUCCESSFUL" as const, paidAt: new Date() } : {}),
    },
    select: { id: true, status: true, resolvedAt: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "revenue.failed-payment.resolve",
    target: auditTarget("school", txn.schoolId),
    targetType: "payment",
    ipAddress: guard.ipAddress,
    details: { transactionId: txn.id, markPaid, note, amount: Number(txn.amount) },
  })

  return NextResponse.json({ ok: true, transaction: updated })
}
