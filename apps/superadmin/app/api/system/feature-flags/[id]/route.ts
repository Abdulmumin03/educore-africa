import { NextResponse } from "next/server"
import type { FeatureFlagScope } from "@prisma/client"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { invalidateFlags } from "@/lib/flags"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const SCOPES = ["GLOBAL", "BY_PLAN", "BY_SCHOOL", "BY_STATE"]

export async function PUT(request: Request, { params }: { params: { id: string } }) {
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

  const existing = await prisma.featureFlag.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: "Flag not found" }, { status: 404 })

  const data: Record<string, unknown> = {}
  // The key is deliberately immutable: other code reads it by name, and a
  // rename would silently turn the flag off everywhere it is referenced.
  if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim()
  if (typeof body.description === "string") data.description = body.description.trim() || null
  if (typeof body.enabled === "boolean") data.enabled = body.enabled
  if (typeof body.defaultValue === "boolean") data.defaultValue = body.defaultValue
  if (body.rollout !== undefined) {
    data.rollout = Math.min(100, Math.max(0, Math.round(Number(body.rollout)) || 0))
  }
  if (typeof body.scope === "string" && SCOPES.includes(body.scope)) {
    data.scope = body.scope as FeatureFlagScope
  }
  if (Array.isArray(body.scopeValues)) {
    data.scopeValues = body.scopeValues.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
    )
  }

  const scope = (data.scope ?? existing.scope) as FeatureFlagScope
  const scopeValues = (data.scopeValues ?? existing.scopeValues) as string[]
  if (scope !== "GLOBAL" && scopeValues.length === 0) {
    return NextResponse.json(
      { error: `A ${scope} flag needs at least one value to scope to.` },
      { status: 400 },
    )
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 })
  }

  const flag = await prisma.featureFlag.update({ where: { id: existing.id }, data })

  // Write-through, not TTL: the toggle has to be live on the next evaluation,
  // not up to 30 seconds later.
  await invalidateFlags()

  await auditLog({
    userId: guard.user.id,
    action: "system.flag.update",
    target: auditTarget("config", flag.key),
    targetType: "config",
    ipAddress: guard.ipAddress,
    details: {
      from: {
        enabled: existing.enabled,
        rollout: existing.rollout,
        scope: existing.scope,
        scopeValues: existing.scopeValues,
      },
      to: {
        enabled: flag.enabled,
        rollout: flag.rollout,
        scope: flag.scope,
        scopeValues: flag.scopeValues,
      },
    },
  })

  return NextResponse.json({ flag })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user)
  if (forbidden) return forbidden

  const existing = await prisma.featureFlag.findUnique({
    where: { id: params.id },
    select: { id: true, key: true, enabled: true },
  })
  if (!existing) return NextResponse.json({ error: "Flag not found" }, { status: 404 })

  // Deleting an enabled flag turns the feature off everywhere at once, which
  // is rarely what somebody clicking a bin icon means.
  if (existing.enabled) {
    return NextResponse.json(
      { error: "Disable the flag before deleting it — code still reading this key would flip to off." },
      { status: 409 },
    )
  }

  await prisma.featureFlag.delete({ where: { id: existing.id } })
  await invalidateFlags()

  await auditLog({
    userId: guard.user.id,
    action: "system.flag.delete",
    target: auditTarget("config", existing.key),
    targetType: "config",
    ipAddress: guard.ipAddress,
    details: { key: existing.key },
  })

  return NextResponse.json({ ok: true })
}
