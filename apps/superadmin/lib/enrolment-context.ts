import { cookies } from "next/headers"

import { prisma } from "@/lib/db"
import { MFA_COOKIE, verifyChallenge } from "@/lib/auth-challenge"
import { clientIp } from "@/lib/ip"
import { validateSession } from "@/lib/session-guard"

// TOTP enrolment happens in two situations, and both must work:
//
//   1. FORCED  — the account has no TOTP yet, so it has no session either.
//                It is holding an "enroll" challenge from the password leg.
//   2. VOLUNTARY — an admin re-enrolling from
//                /console/settings/security/totp with a live session.

export type EnrolmentContext = {
  userId: string
  email: string
  name: string
  ipAddress: string
  /** True in case 1: confirming should also sign the user in. */
  forced: boolean
  /** The enroll challenge, present only in case 1. */
  challenge: string | null
}

export async function resolveEnrolmentContext(
  headers: Headers,
): Promise<EnrolmentContext | null> {
  const ipAddress = clientIp(headers)

  // Case 2 first: a live session is the stronger claim.
  const session = await validateSession(ipAddress)
  if (session.ok) {
    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      ipAddress,
      forced: false,
      challenge: null,
    }
  }

  const challenge = cookies().get(MFA_COOKIE)?.value
  const verified = challenge ? verifyChallenge(challenge, "enroll") : null
  if (!challenge || !verified) return null

  const user = await prisma.superAdminUser.findUnique({
    where: { id: verified.userId },
    select: { id: true, email: true, name: true, isActive: true },
  })
  if (!user || !user.isActive) return null

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    ipAddress,
    forced: true,
    challenge,
  }
}
