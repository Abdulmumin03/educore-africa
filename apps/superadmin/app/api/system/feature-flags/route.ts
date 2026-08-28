import { NextResponse } from "next/server"
import type { FeatureFlagScope } from "@prisma/client"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { FLAG_KEY_PATTERN, allFlags, flagReach, invalidateFlags } from "@/lib/flags"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const SCOPES = ["GLOBAL", "BY_PLAN", "BY_SCHOOL", "BY_STATE"]

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  const flags = await allFlags()
  const ids = await prisma.featureFlag.findMany({
    select: { id: true, key: true, createdAt: true, updatedAt: true },
  })
  const byKey = new Map(ids.map((row) => [row.key, row]))

  // The reach figure is what makes a rollout percentage legible: 30% of a
  // three-school scope is one school, and the page should say so rather than
  // leave the reader to work it out.
  const withReach = await Promise.all(
    flags.map(async (flag) => ({
      ...flag,
      id: byKey.get(flag.key)?.id ?? flag.key,
      createdAt: byKey.get(flag.key)?.createdAt.toISOString() ?? null,
      updatedAt: byKey.get(flag.key)?.updatedAt.toISOString() ?? null,
      reach: await flagReach(flag),
    })),
  )

  return NextResponse.json({ flags: withReach })
}

export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const key = typeof body.key === "string" ? body.key.trim().toLowerCase() : ""
  const label = typeof body.label === "string" ? body.label.trim() : ""
  const scope =
    typeof body.scope === "string" && SCOPES.includes(body.scope)
      ? (body.scope as FeatureFlagScope)
      : "GLOBAL"
  const rollout = Math.min(100, Math.max(0, Math.round(Number(body.rollout ?? 100)) || 0))
  const scopeValues = Array.isArray(body.scopeValues)
    ? body.scopeValues.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : []

  if (!FLAG_KEY_PATTERN.test(key)) {
    return NextResponse.json(
      { error: "Key must be snake_case: lower-case letters, digits and underscores, 3–64 characters." },
      { status: 400 },
    )
  }
  if (!label) return NextResponse.json({ error: "A label is required." }, { status: 400 })
  if (scope !== "GLOBAL" && scopeValues.length === 0) {
    return NextResponse.json(
      { error: `A ${scope} flag needs at least one value to scope to.` },
      { status: 400 },
    )
  }

  const clash = await prisma.featureFlag.findUnique({ where: { key }, select: { id: true } })
  if (clash) return NextResponse.json({ error: "A flag with that key already exists." }, { status: 409 })

  const flag = await prisma.featureFlag.create({
    data: {
      key,
      label,
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      enabled: body.enabled === true,
      defaultValue: body.defaultValue === true,
      rollout,
      scope,
      scopeValues,
      createdById: guard.user.id,
    },
  })

  await invalidateFlags()

  await auditLog({
    userId: guard.user.id,
    action: "system.flag.create",
    target: auditTarget("config", flag.key),
    targetType: "config",
    ipAddress: guard.ipAddress,
    details: { key, label, scope, rollout, enabled: flag.enabled },
  })

  return NextResponse.json({ flag }, { status: 201 })
}
