import { NextResponse } from "next/server"
import type { SchoolPlan } from "@prisma/client"

import { prisma } from "@/lib/db"
import { validatePromo } from "@/lib/promo"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const PLANS = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE", "GOVERNMENT"]

/**
 * Dry-run a code against a plan.
 *
 * Same function signup calls, so what this previews is exactly what a school
 * would get — a validator that only approximates the real one is a trap.
 */
export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const code = typeof body.code === "string" ? body.code : ""
  const plan =
    typeof body.plan === "string" && PLANS.includes(body.plan) ? (body.plan as SchoolPlan) : null
  const cycle = body.cycle === "MONTHLY" || body.cycle === "ANNUAL" ? body.cycle : "TERMLY"

  if (!plan) return NextResponse.json({ error: "Pick a plan." }, { status: 400 })

  const config = await prisma.planConfig.findUnique({ where: { plan } })
  if (!config) return NextResponse.json({ error: "That plan has no catalogue entry." }, { status: 404 })

  const amount =
    cycle === "MONTHLY" ? Number(config.monthly) : cycle === "ANNUAL" ? Number(config.annual) : Number(config.termly)

  const result = await validatePromo({ code, plan, amount })
  return NextResponse.json({ ...result, listPrice: amount, cycle })
}
