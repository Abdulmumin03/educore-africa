import { NextResponse } from "next/server"
import type { PromoDiscountType, SchoolPlan } from "@prisma/client"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { listPromoCodes } from "@/lib/promo"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const PLANS = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE", "GOVERNMENT"]
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,23}$/

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response
  return NextResponse.json({ codes: await listPromoCodes() })
}

export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "FINANCE_ADMIN", "BUSINESS_ADMIN", "SALES_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : ""
  const discountType =
    body.discountType === "PERCENT" || body.discountType === "FIXED"
      ? (body.discountType as PromoDiscountType)
      : null
  const discountValue = Number(body.discountValue)
  const plans = Array.isArray(body.plans)
    ? (body.plans.filter(
        (value): value is SchoolPlan => typeof value === "string" && PLANS.includes(value),
      ) as SchoolPlan[])
    : []
  const expiresAt = typeof body.expiresAt === "string" && body.expiresAt ? new Date(body.expiresAt) : null
  const maxUses =
    body.maxUses === null || body.maxUses === undefined || body.maxUses === ""
      ? null
      : Math.max(1, Math.round(Number(body.maxUses)))

  if (!CODE_PATTERN.test(code)) {
    return NextResponse.json(
      { error: "Codes are 3–24 characters: capitals, digits and hyphens." },
      { status: 400 },
    )
  }
  if (!discountType) {
    return NextResponse.json({ error: "Pick a discount type." }, { status: 400 })
  }
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json({ error: "The discount must be greater than zero." }, { status: 400 })
  }
  if (discountType === "PERCENT" && discountValue > 100) {
    return NextResponse.json({ error: "A percentage discount cannot exceed 100." }, { status: 400 })
  }
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) {
    return NextResponse.json({ error: "The expiry date must be in the future." }, { status: 400 })
  }
  if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1)) {
    return NextResponse.json({ error: "A usage limit must be at least 1." }, { status: 400 })
  }

  const clash = await prisma.promoCode.findUnique({ where: { code }, select: { id: true } })
  if (clash) return NextResponse.json({ error: "That code already exists." }, { status: 409 })

  const promo = await prisma.promoCode.create({
    data: {
      code,
      discountType,
      discountValue,
      plans,
      expiresAt,
      maxUses,
      note: typeof body.note === "string" ? body.note.trim() || null : null,
      createdById: guard.user.id,
    },
    select: { id: true, code: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "config.promo.create",
    target: auditTarget("config", `promo:${promo.code}`),
    targetType: "config",
    ipAddress: guard.ipAddress,
    details: { code, discountType, discountValue, plans, maxUses, expiresAt: expiresAt?.toISOString() ?? null },
  })

  return NextResponse.json({ promo }, { status: 201 })
}
