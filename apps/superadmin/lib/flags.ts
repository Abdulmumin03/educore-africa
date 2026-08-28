import { createHash } from "node:crypto"
import type { FeatureFlagScope, SchoolPlan } from "@prisma/client"

import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"

// Feature flags.
//
// The database is the record; Redis is the read path. A toggle writes both in
// the same request, so a flag takes effect on the next evaluation rather than
// after a cache TTL. The TTL below is only a safety net for a Redis that was
// flushed or a write that lost the race — it is not the propagation delay.

const CACHE_KEY = "flags:all"
const CACHE_TTL_SECONDS = 30

export type FlagSnapshot = {
  key: string
  label: string
  description: string | null
  enabled: boolean
  defaultValue: boolean
  rollout: number
  scope: FeatureFlagScope
  scopeValues: string[]
}

export type FlagContext = {
  schoolId?: string | null
  plan?: SchoolPlan | null
  state?: string | null
}

/**
 * Deterministic 0–99 bucket for a rollout.
 *
 * Hashing (flag, school) rather than rolling a die means a school stays on
 * the same side of a partial rollout across requests, servers and restarts.
 * A percentage that re-rolls per request is not a rollout, it is a coin flip
 * on every page load.
 */
export function bucketFor(flagKey: string, subject: string): number {
  const digest = createHash("sha256").update(`${flagKey}:${subject}`).digest()
  return digest.readUInt32BE(0) % 100
}

export function evaluateFlag(flag: FlagSnapshot, context: FlagContext): boolean {
  if (!flag.enabled) return flag.defaultValue

  // Scope first: a school outside the scope never sees the flag, whatever the
  // rollout says.
  switch (flag.scope) {
    case "GLOBAL":
      break
    case "BY_PLAN":
      if (!context.plan || !flag.scopeValues.includes(context.plan)) return flag.defaultValue
      break
    case "BY_SCHOOL":
      if (!context.schoolId || !flag.scopeValues.includes(context.schoolId)) return flag.defaultValue
      break
    case "BY_STATE":
      if (!context.state || !flag.scopeValues.includes(context.state)) return flag.defaultValue
      break
  }

  if (flag.rollout >= 100) return true
  if (flag.rollout <= 0) return flag.defaultValue

  // Without a stable subject there is nothing to bucket on, so a partial
  // rollout cannot be honoured — fall back to off rather than flip randomly.
  const subject = context.schoolId
  if (!subject) return flag.defaultValue

  return bucketFor(flag.key, subject) < flag.rollout
}

export async function allFlags(): Promise<FlagSnapshot[]> {
  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) return JSON.parse(cached) as FlagSnapshot[]
  } catch {
    // Fall through to the database.
  }

  const rows = await prisma.featureFlag.findMany({
    orderBy: { key: "asc" },
    select: {
      key: true,
      label: true,
      description: true,
      enabled: true,
      defaultValue: true,
      rollout: true,
      scope: true,
      scopeValues: true,
    },
  })

  try {
    await redis.set(CACHE_KEY, JSON.stringify(rows), "EX", CACHE_TTL_SECONDS)
  } catch {
    // Uncached is only slower.
  }

  return rows
}

/** Drop the cache. Called by every write so a toggle is visible immediately. */
export async function invalidateFlags(): Promise<void> {
  try {
    await redis.del(CACHE_KEY)
  } catch {
    // The TTL will clear it within 30 seconds regardless.
  }
}

export async function isEnabled(key: string, context: FlagContext = {}): Promise<boolean> {
  const flag = (await allFlags()).find((entry) => entry.key === key)
  if (!flag) return false
  return evaluateFlag(flag, context)
}

/** How many of the platform's schools a flag currently resolves true for. */
export async function flagReach(flag: FlagSnapshot): Promise<{ matched: number; total: number }> {
  const schools = await prisma.school.findMany({
    where: { deletedAt: null },
    select: { id: true, state: true, subscription: { select: { plan: true } } },
  })

  const matched = schools.filter((school) =>
    evaluateFlag(flag, {
      schoolId: school.id,
      plan: school.subscription?.plan ?? null,
      state: school.state,
    }),
  ).length

  return { matched, total: schools.length }
}

export const FLAG_KEY_PATTERN = /^[a-z][a-z0-9_]{2,63}$/
