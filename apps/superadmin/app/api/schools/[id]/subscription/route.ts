import { NextResponse } from "next/server"
import type { BillingCycle, SchoolPlan } from "@prisma/client"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { monthlyAmount } from "@/lib/metrics"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const PLANS: SchoolPlan[] = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE", "GOVERNMENT"]
const CYCLES: BillingCycle[] = ["MONTHLY", "TERMLY", "ANNUAL"]

/**
 * Change a school's plan, price, cycle or promo code.
 *
 * The school admin is notified through the school app's own Notification
 * table — the console never emails directly, so the message lands in the
 * place the school already looks.
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "BUSINESS_ADMIN", "FINANCE_ADMIN", "SALES_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const existing = await prisma.schoolSubscription.findUnique({ where: { schoolId: params.id } })
  if (!existing) {
    return NextResponse.json({ error: "This school has no subscription." }, { status: 404 })
  }

  const plan = typeof body.plan === "string" && PLANS.includes(body.plan as SchoolPlan)
    ? (body.plan as SchoolPlan)
    : existing.plan
  const cycle = typeof body.cycle === "string" && CYCLES.includes(body.cycle as BillingCycle)
    ? (body.cycle as BillingCycle)
    : existing.cycle
  const amount = body.amount === undefined ? Number(existing.amount) : Number(body.amount)
  const effectiveAt = typeof body.effectiveAt === "string" ? new Date(body.effectiveAt) : null
  const promoCode = typeof body.promoCode === "string" ? body.promoCode.trim().toUpperCase() : undefined
  const promoPercent = body.promoPercent === undefined ? undefined : Number(body.promoPercent)

  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 })
  }
  if (promoPercent !== undefined && (!Number.isFinite(promoPercent) || promoPercent < 0 || promoPercent > 100)) {
    return NextResponse.json({ error: "Promo percent must be between 0 and 100." }, { status: 400 })
  }
  if (effectiveAt && Number.isNaN(effectiveAt.getTime())) {
    return NextResponse.json({ error: "effectiveAt is not a valid date." }, { status: 400 })
  }

  const fromMonthly = monthlyAmount(Number(existing.amount), existing.cycle)
  const toMonthly = monthlyAmount(amount, cycle)
  const changedPlan = existing.plan !== plan
  const changedPrice = Number(existing.amount) !== amount || existing.cycle !== cycle

  const subscription = await prisma.$transaction(async (tx) => {
    const updated = await tx.schoolSubscription.update({
      where: { schoolId: params.id },
      data: {
        plan,
        cycle,
        amount,
        ...(effectiveAt ? { renewsAt: effectiveAt } : {}),
        ...(promoCode !== undefined ? { promoCode: promoCode || null } : {}),
        ...(promoPercent !== undefined ? { promoPercent: promoPercent || null } : {}),
      },
    })

    // Append-only history. Net revenue retention cannot separate expansion
    // from contraction without it — the current amount says nothing about
    // what the school used to pay.
    if (changedPlan || changedPrice) {
      await tx.subscriptionRevision.create({
        data: {
          subscriptionId: existing.id,
          schoolId: params.id,
          kind: changedPlan
            ? toMonthly >= fromMonthly
              ? "UPGRADE"
              : "DOWNGRADE"
            : existing.cycle !== cycle
              ? "CYCLE_CHANGE"
              : "PRICE_CHANGE",
          fromPlan: existing.plan,
          toPlan: plan,
          fromMonthly,
          toMonthly,
          effectiveAt: effectiveAt ?? new Date(),
          actorId: guard.user.id,
        },
      })
    }

    return updated
  })

  await auditLog({
    userId: guard.user.id,
    action: "school.subscription.update",
    target: auditTarget("school", params.id),
    targetType: "school",
    ipAddress: guard.ipAddress,
    details: {
      from: { plan: existing.plan, amount: Number(existing.amount), cycle: existing.cycle },
      to: { plan, amount, cycle },
      mrrFrom: fromMonthly,
      mrrTo: toMonthly,
      effectiveAt: effectiveAt?.toISOString() ?? null,
      promoCode: promoCode ?? existing.promoCode,
    },
  })

  // Tell the school, in their own app. Notification rows are per-user, so
  // this goes to the school's admins and principal — not every teacher.
  if (changedPlan || changedPrice) {
    try {
      const recipients = await prisma.user.findMany({
        where: {
          schoolId: params.id,
          deletedAt: null,
          isActive: true,
          role: { in: ["SCHOOL_ADMIN", "PRINCIPAL"] },
        },
        select: { id: true },
      })

      if (recipients.length > 0) {
        await prisma.notification.createMany({
          data: recipients.map((recipient) => ({
            schoolId: params.id,
            userId: recipient.id,
            channel: "IN_APP" as const,
            title: changedPlan ? `Your plan is now ${plan}` : "Your subscription was updated",
            body: `EduCore support updated your subscription${
              effectiveAt ? `, effective ${effectiveAt.toLocaleDateString("en-NG")}` : ""
            }. Get in touch if this looks wrong.`,
            metadata: { plan, amount, cycle, source: "superadmin-console" },
          })),
        })
      }
    } catch (error) {
      // Never fail the change because the courtesy notice could not be written.
      console.error("[subscription] notification failed", error)
    }
  }

  return NextResponse.json({ subscription })
}
