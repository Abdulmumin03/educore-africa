import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/**
 * Deactivate a code.
 *
 * A code that has been redeemed is DEACTIVATED, never deleted: the
 * redemption ledger references it, and a school that got a discount is
 * entitled to have the reason for it survive. A code nobody used is removed
 * outright, because there is nothing to preserve.
 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "FINANCE_ADMIN", "BUSINESS_ADMIN", "SALES_ADMIN")
  if (forbidden) return forbidden

  const promo = await prisma.promoCode.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, isActive: true, _count: { select: { redemptions: true } } },
  })
  if (!promo) return NextResponse.json({ error: "Code not found" }, { status: 404 })

  const redeemed = promo._count.redemptions > 0

  if (redeemed) {
    await prisma.promoCode.update({ where: { id: promo.id }, data: { isActive: false } })
  } else {
    await prisma.promoCode.delete({ where: { id: promo.id } })
  }

  await auditLog({
    userId: guard.user.id,
    action: redeemed ? "config.promo.deactivate" : "config.promo.delete",
    target: auditTarget("config", `promo:${promo.code}`),
    targetType: "config",
    ipAddress: guard.ipAddress,
    details: { code: promo.code, redemptions: promo._count.redemptions },
  })

  return NextResponse.json({
    ok: true,
    action: redeemed ? "deactivated" : "deleted",
    notice: redeemed
      ? `${promo.code} has been redeemed ${promo._count.redemptions} time(s), so it was deactivated rather than deleted — the redemption ledger still needs it.`
      : `${promo.code} was never redeemed, so it was removed.`,
  })
}
