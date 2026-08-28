import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"
import { formatCurrency } from "@/lib/utils"

export const dynamic = "force-dynamic"

/**
 * Queue a dunning reminder for one failed charge.
 *
 * The console does not send SMS itself — dispatch belongs to the school app's
 * BullMQ worker, and duplicating it here would mean two senders with two
 * rate limits. What this does is write the in-app Notification the school's
 * admins will see, and record the reminder against the transaction so the
 * failed-payments screen can show how many have gone out.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "FINANCE_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  const txn = await prisma.subscriptionTransaction.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      amount: true,
      schoolId: true,
      status: true,
      dueDate: true,
      remindersSent: true,
      school: { select: { name: true } },
    },
  })

  if (!txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
  if (txn.status !== "FAILED") {
    return NextResponse.json({ error: "Only failed charges can be chased." }, { status: 409 })
  }

  const recipients = await prisma.user.findMany({
    where: {
      schoolId: txn.schoolId,
      deletedAt: null,
      isActive: true,
      role: { in: ["SCHOOL_ADMIN", "PRINCIPAL", "BURSAR"] },
    },
    select: { id: true },
  })

  if (recipients.length > 0) {
    await prisma.notification.createMany({
      data: recipients.map((recipient) => ({
        schoolId: txn.schoolId,
        userId: recipient.id,
        channel: "IN_APP" as const,
        title: "Subscription payment failed",
        body: `We could not collect ${formatCurrency(Number(txn.amount))} for your EduCore subscription. Please update your payment method to avoid interruption.`,
        metadata: { transactionId: txn.id, source: "superadmin-console", kind: "dunning" },
      })),
    })
  }

  const updated = await prisma.subscriptionTransaction.update({
    where: { id: txn.id },
    data: { remindersSent: { increment: 1 }, lastReminderAt: new Date() },
    select: { remindersSent: true, lastReminderAt: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "revenue.reminder.send",
    target: auditTarget("school", txn.schoolId),
    targetType: "payment",
    ipAddress: guard.ipAddress,
    details: {
      transactionId: txn.id,
      amount: Number(txn.amount),
      recipients: recipients.length,
      reminderNumber: updated.remindersSent,
    },
  })

  return NextResponse.json({
    ok: true,
    notified: recipients.length,
    remindersSent: updated.remindersSent,
    lastReminderAt: updated.lastReminderAt?.toISOString() ?? null,
    // Be explicit: no SMS or email left this process.
    channels: { inApp: recipients.length, sms: 0, email: 0 },
    note:
      recipients.length === 0
        ? "No active admin, principal or bursar account to notify at this school."
        : "In-app notice created. SMS and email dispatch is the school app worker's job.",
  })
}
