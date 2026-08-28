import type { PrismaClient, PromoDiscountType, SchoolPlan } from "@prisma/client"

// Promo-code rules, shared by BOTH apps.
//
// This lives in the database package rather than in either app because the
// console previews codes and the school app redeems them, and a code the
// console calls valid that signup then rejects is worse than having no promo
// system at all. One implementation, one set of rules, no drift.
//
// The functions take a PrismaClient so each app passes its own instance.

export type PromoFailure =
  | "not_found"
  | "inactive"
  | "expired"
  | "exhausted"
  | "wrong_plan"
  | "already_redeemed"

export type PromoValidation =
  | {
      ok: true
      code: string
      promoCodeId: string
      discountType: PromoDiscountType
      discountValue: number
      /** Naira taken off the given price. */
      amountOff: number
      finalAmount: number
    }
  | { ok: false; reason: PromoFailure; message: string }

export const PROMO_MESSAGES: Record<PromoFailure, string> = {
  not_found: "That code does not exist.",
  inactive: "That code has been deactivated.",
  expired: "That code has expired.",
  exhausted: "That code has reached its usage limit.",
  wrong_plan: "That code does not apply to the plan you picked.",
  already_redeemed: "That code has already been used by this school.",
}

/** Round to whole naira — nothing on this platform bills in kobo. */
export function applyDiscount(
  amount: number,
  discountType: PromoDiscountType,
  discountValue: number,
): number {
  const off =
    discountType === "PERCENT"
      ? (amount * Math.min(100, Math.max(0, discountValue))) / 100
      : discountValue
  // Never below zero, and never more than the price itself.
  return Math.min(amount, Math.max(0, Math.round(off)))
}

export async function validatePromo(
  prisma: PrismaClient,
  input: { code: string; plan: SchoolPlan; amount: number; schoolId?: string | null },
): Promise<PromoValidation> {
  const code = input.code.trim().toUpperCase()
  if (!code) return { ok: false, reason: "not_found", message: PROMO_MESSAGES.not_found }

  const promo = await prisma.promoCode.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      isActive: true,
      expiresAt: true,
      maxUses: true,
      usedCount: true,
      plans: true,
      discountType: true,
      discountValue: true,
    },
  })

  if (!promo) return { ok: false, reason: "not_found", message: PROMO_MESSAGES.not_found }
  if (!promo.isActive) return { ok: false, reason: "inactive", message: PROMO_MESSAGES.inactive }
  if (promo.expiresAt && promo.expiresAt <= new Date()) {
    return { ok: false, reason: "expired", message: PROMO_MESSAGES.expired }
  }
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    return { ok: false, reason: "exhausted", message: PROMO_MESSAGES.exhausted }
  }
  if (promo.plans.length > 0 && !promo.plans.includes(input.plan)) {
    return { ok: false, reason: "wrong_plan", message: PROMO_MESSAGES.wrong_plan }
  }

  if (input.schoolId) {
    const already = await prisma.promoRedemption.findUnique({
      where: { promoCodeId_schoolId: { promoCodeId: promo.id, schoolId: input.schoolId } },
      select: { id: true },
    })
    if (already) {
      return { ok: false, reason: "already_redeemed", message: PROMO_MESSAGES.already_redeemed }
    }
  }

  const discountValue = Number(promo.discountValue)
  const amountOff = applyDiscount(input.amount, promo.discountType, discountValue)

  return {
    ok: true,
    code: promo.code,
    promoCodeId: promo.id,
    discountType: promo.discountType,
    discountValue,
    amountOff,
    finalAmount: input.amount - amountOff,
  }
}

/**
 * Record a redemption.
 *
 * The unique index on (promoCodeId, schoolId) is what actually prevents a
 * double redemption — the check in `validatePromo` only gives a readable
 * message. A conflict is reported, never swallowed, so a caller cannot book a
 * discount it did not get.
 */
export async function redeemPromo(
  prisma: PrismaClient,
  input: { promoCodeId: string; schoolId: string; plan: SchoolPlan; amountOff: number },
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await prisma.$transaction([
      prisma.promoRedemption.create({
        data: {
          promoCodeId: input.promoCodeId,
          schoolId: input.schoolId,
          plan: input.plan,
          amountOff: input.amountOff,
        },
      }),
      prisma.promoCode.update({
        where: { id: input.promoCodeId },
        data: { usedCount: { increment: 1 } },
      }),
    ])
    return { ok: true }
  } catch {
    return { ok: false, message: PROMO_MESSAGES.already_redeemed }
  }
}
