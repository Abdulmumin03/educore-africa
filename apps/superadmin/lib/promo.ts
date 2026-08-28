import type { SchoolPlan } from "@prisma/client"

import { prisma } from "@/lib/db"

// Promo codes.
//
// The RULES live in packages/database/promo.ts because the school app has to
// apply exactly the same ones at signup — a code the console says is valid
// and signup rejects is worse than no promo system. This file is the
// console-side binding: same functions, this app's Prisma client.

export {
  applyDiscount,
  PROMO_MESSAGES,
  type PromoFailure,
  type PromoValidation,
} from "@educore/database"

import {
  redeemPromo as redeemShared,
  validatePromo as validateShared,
} from "@educore/database"

export function validatePromo(input: {
  code: string
  plan: SchoolPlan
  amount: number
  schoolId?: string | null
}) {
  return validateShared(prisma, input)
}

export function redeemPromo(input: {
  promoCodeId: string
  schoolId: string
  plan: SchoolPlan
  amountOff: number
}) {
  return redeemShared(prisma, input)
}

export async function listPromoCodes() {
  const codes = await prisma.promoCode.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      code: true,
      discountType: true,
      discountValue: true,
      plans: true,
      expiresAt: true,
      maxUses: true,
      usedCount: true,
      isActive: true,
      note: true,
      createdAt: true,
      _count: { select: { redemptions: true } },
    },
  })

  const now = new Date()
  return codes.map((code) => ({
    id: code.id,
    code: code.code,
    discountType: code.discountType,
    discountValue: Number(code.discountValue),
    plans: code.plans,
    expiresAt: code.expiresAt?.toISOString() ?? null,
    maxUses: code.maxUses,
    // The ledger is the truth; usedCount is a cache of it.
    usedCount: code._count.redemptions,
    isActive: code.isActive,
    note: code.note,
    createdAt: code.createdAt.toISOString(),
    status: !code.isActive
      ? ("inactive" as const)
      : code.expiresAt && code.expiresAt <= now
        ? ("expired" as const)
        : code.maxUses !== null && code._count.redemptions >= code.maxUses
          ? ("exhausted" as const)
          : ("live" as const),
  }))
}
