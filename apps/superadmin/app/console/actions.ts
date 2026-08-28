"use server"

import { signOut } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getConsoleUser } from "@/lib/session"
import { AUTH_ACTIONS, auditLog, auditTarget } from "@/lib/audit"

export async function signOutAction() {
  const user = await getConsoleUser()

  if (user) {
    // Revoke the row as well as the cookie, so the token can never be
    // replayed even if the cookie survives somewhere.
    await prisma.superAdminSession.updateMany({
      where: { token: user.sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "logout" },
    })

    await auditLog({
      userId: user.id,
      action: AUTH_ACTIONS.LOGOUT,
      target: auditTarget("session", user.sessionId.slice(0, 12)),
      targetType: "session",
    })
  }

  await signOut({ redirectTo: "/login" })
}
