import { NextResponse } from "next/server"
import type { SchoolPlan } from "@prisma/client"
import { validatePromo } from "@educore/database"

import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PLANS = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE", "GOVERNMENT"]

/**
 * Check a promo code during signup.
 *
 * Unauthenticated by necessity — the school does not exist yet. That means it
 * is a code oracle, so it is rate-limited per address and never says anything
 * beyond whether the code applies: no discount hints for codes that failed,
 * and no enumeration of what other codes exist.
 */
const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 10

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const record = attempts.get(ip)
  if (!record || record.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  record.count += 1
  return record.count > MAX_PER_WINDOW
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"

  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, message: "Too many attempts. Wait a minute and try again." },
      { status: 429 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, message: "Malformed request." }, { status: 400 })
  }

  const code = typeof body.code === "string" ? body.code : ""
  const plan =
    typeof body.plan === "string" && PLANS.includes(body.plan) ? (body.plan as SchoolPlan) : null

  if (!plan) return NextResponse.json({ ok: false, message: "Pick a plan first." }, { status: 400 })

  const config = await prisma.planConfig.findUnique({ where: { plan } })
  if (!config) {
    return NextResponse.json(
      { ok: false, message: "That plan is not available right now." },
      { status: 404 },
    )
  }

  const listPrice = Number(config.termly)
  const result = await validatePromo(prisma, { code, plan, amount: listPrice })

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message })
  }

  return NextResponse.json({
    ok: true,
    code: result.code,
    amountOff: result.amountOff,
    finalAmount: result.finalAmount,
    listPrice,
  })
}
