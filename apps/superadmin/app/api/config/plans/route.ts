import { NextResponse } from "next/server"
import type { SchoolPlan } from "@prisma/client"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const PLANS = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE", "GOVERNMENT"]

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const [configs, subscribers] = await Promise.all([
    prisma.planConfig.findMany({ orderBy: { monthly: "asc" } }),
    prisma.schoolSubscription.groupBy({
      by: ["plan"],
      where: { school: { deletedAt: null } },
      _count: { _all: true },
    }),
  ])

  const counts = new Map(subscribers.map((row) => [row.plan, row._count._all]))

  return NextResponse.json({
    plans: configs.map((config) => ({
      id: config.id,
      plan: config.plan,
      label: config.label,
      monthly: Number(config.monthly),
      termly: Number(config.termly),
      annual: Number(config.annual),
      maxStudents: config.maxStudents,
      storageGb: config.storageGb,
      smsCredits: config.smsCredits,
      modules: config.modules,
      isPublic: config.isPublic,
      updatedAt: config.updatedAt.toISOString(),
      // What a price change would NOT affect, spelled out per row.
      existingSubscribers: counts.get(config.plan) ?? 0,
    })),
    notice:
      "Catalogue pricing applies to new signups and to any plan change made from here. Schools already on a plan keep the amount on their subscription until somebody changes it.",
  })
}

export async function PUT(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "FINANCE_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  let body: { plans?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  if (!Array.isArray(body.plans) || body.plans.length === 0) {
    return NextResponse.json({ error: "Send a `plans` array." }, { status: 400 })
  }

  const changes: Array<Record<string, unknown>> = []

  for (const raw of body.plans) {
    if (!raw || typeof raw !== "object") continue
    const entry = raw as Record<string, unknown>
    const plan = typeof entry.plan === "string" && PLANS.includes(entry.plan) ? (entry.plan as SchoolPlan) : null
    if (!plan) continue

    const existing = await prisma.planConfig.findUnique({ where: { plan } })
    if (!existing) continue

    const numeric = (value: unknown, fallback: number): number => {
      const parsed = Number(value)
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
    }

    const monthly = numeric(entry.monthly, Number(existing.monthly))
    const termly = numeric(entry.termly, Number(existing.termly))
    const annual = numeric(entry.annual, Number(existing.annual))

    // Annual should not cost more than twelve months at the monthly rate —
    // that is a data-entry slip, not a pricing strategy.
    if (annual > monthly * 12) {
      return NextResponse.json(
        {
          error: `${existing.label}: the annual price is higher than twelve monthly payments. Check the figures.`,
        },
        { status: 400 },
      )
    }

    const updated = await prisma.planConfig.update({
      where: { plan },
      data: {
        label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : existing.label,
        monthly,
        termly,
        annual,
        maxStudents:
          entry.maxStudents === null || entry.maxStudents === ""
            ? null
            : Math.max(0, Math.round(numeric(entry.maxStudents, existing.maxStudents ?? 0))) || null,
        storageGb: Math.max(0, Math.round(numeric(entry.storageGb, existing.storageGb))),
        smsCredits: Math.max(0, Math.round(numeric(entry.smsCredits, existing.smsCredits))),
        modules: Array.isArray(entry.modules)
          ? entry.modules.filter((value): value is string => typeof value === "string")
          : existing.modules,
        isPublic: typeof entry.isPublic === "boolean" ? entry.isPublic : existing.isPublic,
        updatedById: guard.user.id,
      },
    })

    const before = {
      monthly: Number(existing.monthly),
      termly: Number(existing.termly),
      annual: Number(existing.annual),
      maxStudents: existing.maxStudents,
      storageGb: existing.storageGb,
      smsCredits: existing.smsCredits,
      modules: existing.modules,
    }
    const after = {
      monthly: Number(updated.monthly),
      termly: Number(updated.termly),
      annual: Number(updated.annual),
      maxStudents: updated.maxStudents,
      storageGb: updated.storageGb,
      smsCredits: updated.smsCredits,
      modules: updated.modules,
    }

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ plan, from: before, to: after })
    }
  }

  if (changes.length === 0) {
    return NextResponse.json({ ok: true, changed: 0, notice: "Nothing differed from what was stored." })
  }

  // One audit row per plan changed, so the trail reads as five separate price
  // decisions rather than one opaque "config saved".
  for (const change of changes) {
    await auditLog({
      userId: guard.user.id,
      action: "config.plan.update",
      target: auditTarget("config", `plan:${change.plan}`),
      targetType: "config",
      ipAddress: guard.ipAddress,
      details: change,
    })
  }

  return NextResponse.json({
    ok: true,
    changed: changes.length,
    notice: "Existing subscriptions were not re-priced.",
  })
}
