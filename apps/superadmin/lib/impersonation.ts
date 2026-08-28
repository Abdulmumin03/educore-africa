import { randomBytes } from "node:crypto"

import { prisma } from "@/lib/db"
import { sha256 } from "@/lib/crypto"

// A time-boxed, READ-ONLY pass into a school's own app.
//
// The console mints an opaque token and stores only its sha256. The plaintext
// is handed to the browser once, in a redirect URL, and cannot be recovered
// from the database. The school app validates it against this table on
// redemption and again on every request, so revoking a grant is immediate.

export const IMPERSONATION_TTL_MINUTES = 60

export function schoolAppUrl(): string {
  return process.env.NEXT_PUBLIC_SCHOOL_APP_URL ?? "http://localhost:3000"
}

export async function createImpersonationGrant(opts: {
  schoolId: string
  superAdminUserId: string
  ipAddress: string
  userAgent?: string | null
  reason?: string | null
}): Promise<{ token: string; expiresAt: Date; redirectUrl: string; grantId: string }> {
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MINUTES * 60_000)

  const grant = await prisma.impersonationGrant.create({
    data: {
      tokenHash: sha256(token),
      schoolId: opts.schoolId,
      superAdminUserId: opts.superAdminUserId,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent?.slice(0, 240) ?? null,
      reason: opts.reason ?? null,
      expiresAt,
    },
    select: { id: true },
  })

  const url = new URL("/api/impersonation/accept", schoolAppUrl())
  url.searchParams.set("token", token)

  return { token, expiresAt, redirectUrl: url.toString(), grantId: grant.id }
}

export type ActiveGrant = {
  id: string
  schoolId: string
  superAdminUserId: string
  expiresAt: Date
}

/** Live grant for a plaintext token, or null. Also stamps first use. */
export async function redeemImpersonationToken(token: string): Promise<ActiveGrant | null> {
  const grant = await prisma.impersonationGrant.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      schoolId: true,
      superAdminUserId: true,
      expiresAt: true,
      endedAt: true,
      usedAt: true,
    },
  })

  if (!grant || grant.endedAt || grant.expiresAt <= new Date()) return null

  if (!grant.usedAt) {
    await prisma.impersonationGrant.update({
      where: { id: grant.id },
      data: { usedAt: new Date() },
    })
  }

  return {
    id: grant.id,
    schoolId: grant.schoolId,
    superAdminUserId: grant.superAdminUserId,
    expiresAt: grant.expiresAt,
  }
}

export async function endImpersonation(grantId: string): Promise<boolean> {
  const result = await prisma.impersonationGrant.updateMany({
    where: { id: grantId, endedAt: null },
    data: { endedAt: new Date() },
  })
  return result.count === 1
}

/** Grants still live for a school — shown on the profile so nothing is silent. */
export function activeGrantsForSchool(schoolId: string) {
  return prisma.impersonationGrant.findMany({
    where: { schoolId, endedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { startedAt: "desc" },
    select: { id: true, superAdminUserId: true, startedAt: true, expiresAt: true, reason: true },
  })
}
