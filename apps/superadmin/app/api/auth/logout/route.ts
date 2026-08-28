import { NextResponse } from "next/server"

import { SESSION_COOKIE } from "@/auth.config"
import { prisma } from "@/lib/db"
import { AUTH_ACTIONS, auditLog, auditTarget } from "@/lib/audit"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  // An expired or already-revoked session still clears cookies below rather
  // than erroring — logging out must never fail.
  if (!guard.ok) return clearAndRespond()

  await prisma.superAdminSession.updateMany({
    where: { token: guard.user.sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: "logout" },
  })

  await auditLog({
    userId: guard.user.id,
    action: AUTH_ACTIONS.LOGOUT,
    target: auditTarget("session", guard.user.sessionId.slice(0, 12)),
    targetType: "session",
    ipAddress: guard.ipAddress,
  })

  return clearAndRespond()
}

function clearAndRespond() {
  const response = NextResponse.json({ ok: true, next: "/login" })
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  })
  // The trust cookie deliberately SURVIVES logout — that is the whole point
  // of "trust this device for 30 days".
  return response
}
