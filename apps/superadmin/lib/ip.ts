import type { NextRequest } from "next/server"

import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"

/**
 * Client IP from the proxy chain. The console sits behind a load balancer, so
 * the FIRST entry of x-forwarded-for is the real client.
 */
export function clientIp(headers: Headers | NextRequest["headers"]): string {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return headers.get("x-real-ip") ?? "unknown"
}

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/** The environment-wide allowlist (office / VPN egress addresses). */
export function envAllowlist(): string[] {
  return parseList(process.env.ALLOWED_IPS)
}

/** ALLOWED_IPS=* is the documented development bypass. */
export function isGlobalBypass(): boolean {
  return envAllowlist().includes("*")
}

function matches(ip: string, entry: string): boolean {
  // Entries are exact addresses ("102.89.1.4") or dotted prefixes ("102.89.").
  return entry.endsWith(".") ? ip.startsWith(entry) : entry === ip
}

/**
 * Is `ip` allowed by this list?
 *
 * An EMPTY list means "allow everything" in development and "deny everything"
 * in production — an unconfigured production console fails closed.
 */
export function isIpAllowed(ip: string, allowlist: string[] = envAllowlist()): boolean {
  if (allowlist.length === 0) return process.env.NODE_ENV !== "production"
  if (allowlist.includes("*")) return true
  return allowlist.some((entry) => matches(ip, entry))
}

// ─── Per-user allowlist ─────────────────────────────────────────────
// Cached for 5 minutes: this is read on every authenticated request, and the
// list changes about as often as an office moves.

const CACHE_TTL_SECONDS = 5 * 60
const cacheKey = (userId: string) => `allowed-ips:${userId}`

export async function userAllowlist(userId: string): Promise<string[]> {
  try {
    const hit = await redis.get(cacheKey(userId))
    if (hit) return JSON.parse(hit) as string[]
  } catch {
    // Redis down — fall through to the database rather than fail the request.
  }

  const user = await prisma.superAdminUser.findUnique({
    where: { id: userId },
    select: { allowedIPs: true },
  })
  const list = user?.allowedIPs ?? []

  try {
    await redis.set(cacheKey(userId), JSON.stringify(list), "EX", CACHE_TTL_SECONDS)
  } catch {
    // Non-fatal.
  }

  return list
}

/** Drop the cache after editing a user's allowlist. */
export async function invalidateUserAllowlist(userId: string): Promise<void> {
  try {
    await redis.del(cacheKey(userId))
  } catch {
    // Non-fatal — the entry ages out in 5 minutes anyway.
  }
}

/**
 * Full check for an identified user: the per-user list wins when set,
 * otherwise the environment list applies. `*` bypasses both.
 */
export async function isIpAllowedForUser(userId: string, ip: string): Promise<boolean> {
  if (isGlobalBypass()) return true

  const personal = await userAllowlist(userId)
  if (personal.length > 0) return personal.some((entry) => matches(ip, entry))

  return isIpAllowed(ip)
}
