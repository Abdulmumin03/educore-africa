import { createHash } from "node:crypto"
import { cookies } from "next/headers"

import { prisma } from "@/lib/db"

// School-app side of EduCore support impersonation.
//
// The Super Admin Console mints a grant and hands the browser an opaque
// token; this app validates it against impersonation_grants on EVERY request.
// Revoking a grant in the console therefore takes effect immediately, and no
// NextAuth session is ever created — an impersonated viewer is authenticated
// by the grant alone, which is why writes are blocked outright.

export const IMPERSONATION_COOKIE = "educore.impersonation"

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export type ActiveImpersonation = {
  grantId: string
  schoolId: string
  expiresAt: Date
  school: { id: string; name: string; logoUrl: string | null }
}

/** Validate the impersonation cookie, or null when there isn't a live grant. */
export async function currentImpersonation(): Promise<ActiveImpersonation | null> {
  const token = cookies().get(IMPERSONATION_COOKIE)?.value
  if (!token) return null

  const grant = await prisma.impersonationGrant.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      schoolId: true,
      expiresAt: true,
      endedAt: true,
      school: { select: { id: true, name: true, logoUrl: true } },
    },
  })

  if (!grant || grant.endedAt || grant.expiresAt <= new Date()) return null

  return {
    grantId: grant.id,
    schoolId: grant.schoolId,
    expiresAt: grant.expiresAt,
    school: grant.school,
  }
}

/** Redeem a plaintext token handed over in the redirect URL. */
export async function redeemToken(token: string): Promise<ActiveImpersonation | null> {
  const grant = await prisma.impersonationGrant.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      schoolId: true,
      expiresAt: true,
      endedAt: true,
      usedAt: true,
      school: { select: { id: true, name: true, logoUrl: true } },
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
    grantId: grant.id,
    schoolId: grant.schoolId,
    expiresAt: grant.expiresAt,
    school: grant.school,
  }
}

export function impersonationCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  }
}
