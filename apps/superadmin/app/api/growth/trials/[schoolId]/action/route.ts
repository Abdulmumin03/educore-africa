import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const ACTIONS = ["extend", "convert", "nudge", "lost"] as const
type Action = (typeof ACTIONS)[number]

/**
 * Act on a trial.
 *
 * "Nudge" writes the in-app notification the school's admins will see. It
 * does NOT send SMS or email: those senders live in the school app and bill
 * against the school's own credit, and the response says which channels
 * actually carried the message.
 */
export async function POST(request: Request, { params }: { params: { schoolId: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SALES_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const action = ACTIONS.includes(body.action as Action) ? (body.action as Action) : null
  if (!action) return NextResponse.json({ error: "Unknown action." }, { status: 400 })

  const subscription = await prisma.schoolSubscription.findUnique({
    where: { schoolId: params.schoolId },
    select: {
      id: true,
      status: true,
      plan: true,
      cycle: true,
      amount: true,
      trialEndsAt: true,
      school: { select: { id: true, name: true } },
    },
  })
  if (!subscription) return NextResponse.json({ error: "School has no subscription." }, { status: 404 })
  if (subscription.status !== "TRIAL") {
    return NextResponse.json({ error: "That school is not on a trial." }, { status: 400 })
  }

  switch (action) {
    case "extend": {
      const days = Math.min(60, Math.max(1, Math.round(Number(body.days ?? 14))))
      // Extend from today when the trial has already lapsed, otherwise from
      // its current end — extending a month-expired trial by 14 days should
      // not leave it still expired.
      const base =
        subscription.trialEndsAt && subscription.trialEndsAt > new Date()
          ? subscription.trialEndsAt
          : new Date()
      const trialEndsAt = new Date(base.getTime() + days * 86_400_000)

      await prisma.schoolSubscription.update({
        where: { id: subscription.id },
        data: { trialEndsAt },
      })

      await auditLog({
        userId: guard.user.id,
        action: "growth.trial.extend",
        target: auditTarget("school", subscription.school.id),
        targetType: "school",
        ipAddress: guard.ipAddress,
        details: {
          school: subscription.school.name,
          days,
          from: { trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null },
          to: { trialEndsAt: trialEndsAt.toISOString() },
        },
      })

      return NextResponse.json({ ok: true, trialEndsAt: trialEndsAt.toISOString(), days })
    }

    case "convert": {
      const now = new Date()
      const [, revision] = await prisma.$transaction([
        prisma.schoolSubscription.update({
          where: { id: subscription.id },
          data: { status: "ACTIVE", startedAt: now, trialEndsAt: null, renewsAt: new Date(now.getTime() + 90 * 86_400_000) },
        }),
        // The revenue module reads revision history; a conversion that skipped
        // it would leave NRR unable to see the expansion.
        prisma.subscriptionRevision.create({
          data: {
            subscriptionId: subscription.id,
            schoolId: subscription.school.id,
            kind: "UPGRADE",
            fromPlan: subscription.plan,
            toPlan: subscription.plan,
            fromMonthly: 0,
            toMonthly:
              subscription.cycle === "MONTHLY"
                ? Number(subscription.amount)
                : subscription.cycle === "TERMLY"
                  ? Number(subscription.amount) / 3
                  : Number(subscription.amount) / 12,
            effectiveAt: now,
            note: "Trial converted from the growth console",
            actorId: guard.user.id,
          },
          select: { id: true },
        }),
      ])

      await auditLog({
        userId: guard.user.id,
        action: "growth.trial.convert",
        target: auditTarget("school", subscription.school.id),
        targetType: "school",
        ipAddress: guard.ipAddress,
        details: {
          school: subscription.school.name,
          plan: subscription.plan,
          from: { status: "TRIAL" },
          to: { status: "ACTIVE" },
          revisionId: revision.id,
        },
      })

      return NextResponse.json({ ok: true, status: "ACTIVE" })
    }

    case "nudge": {
      const message =
        typeof body.message === "string" && body.message.trim()
          ? body.message.trim()
          : `Your EduCore trial ends soon. Reply to this message or contact support and we will help you get set up.`

      const recipients = await prisma.user.findMany({
        where: {
          schoolId: subscription.school.id,
          deletedAt: null,
          isActive: true,
          role: { in: ["SCHOOL_ADMIN", "PRINCIPAL"] },
        },
        select: { id: true },
      })

      const created = await prisma.notification.createMany({
        data: recipients.map((user) => ({
          schoolId: subscription.school.id,
          userId: user.id,
          channel: "IN_APP" as const,
          title: "A note from EduCore",
          body: message,
          metadata: { source: "trial-nudge", by: guard.user.id },
          sentAt: new Date(),
        })),
      })

      await auditLog({
        userId: guard.user.id,
        action: "growth.trial.nudge",
        target: auditTarget("school", subscription.school.id),
        targetType: "school",
        ipAddress: guard.ipAddress,
        details: { school: subscription.school.name, inAppSent: created.count },
      })

      return NextResponse.json({
        ok: true,
        inAppSent: created.count,
        channels: { inApp: created.count, sms: 0, email: 0 },
        notice:
          "Delivered to the in-app inbox only. SMS and email are sent by the school app against the school's own credit.",
      })
    }

    case "lost": {
      const reason = typeof body.reason === "string" ? body.reason.trim() : ""
      if (!reason) return NextResponse.json({ error: "Give a reason." }, { status: 400 })

      await prisma.schoolSubscription.update({
        where: { id: subscription.id },
        data: { status: "CHURNED", cancelledAt: new Date(), churnReason: reason },
      })

      await auditLog({
        userId: guard.user.id,
        action: "growth.trial.lost",
        target: auditTarget("school", subscription.school.id),
        targetType: "school",
        ipAddress: guard.ipAddress,
        details: { school: subscription.school.name, reason, from: { status: "TRIAL" }, to: { status: "CHURNED" } },
      })

      return NextResponse.json({ ok: true, status: "CHURNED" })
    }
  }
}
