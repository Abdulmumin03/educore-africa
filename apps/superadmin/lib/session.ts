import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { SuperAdminRole } from "@prisma/client"

import { clientIp } from "@/lib/ip"
import { validateSession, type ConsoleUser } from "@/lib/session-guard"

export type { ConsoleUser } from "@/lib/session-guard"

// Server-component side of lib/session-guard: same validation, but it
// redirects instead of returning JSON.

function requestIp(): string {
  try {
    return clientIp(headers())
  } catch {
    return "unknown"
  }
}

export async function getConsoleUser(): Promise<ConsoleUser | null> {
  const result = await validateSession(requestIp())
  return result.ok ? result.user : null
}

/** Bounces to /login (or /denied for a blocked IP) instead of returning null. */
export async function requireConsoleUser(): Promise<ConsoleUser> {
  const result = await validateSession(requestIp())

  if (!result.ok) {
    if (result.reason === "ip-blocked") redirect("/denied")
    if (result.reason === "idle-expired") redirect("/login?reason=idle")
    if (result.reason === "absolute-expired") redirect("/login?reason=expired")
    redirect("/login")
  }

  return result.user
}

/** Role gate for a page. Redirects home when the role is wrong. */
export async function requireRole(...roles: SuperAdminRole[]): Promise<ConsoleUser> {
  const user = await requireConsoleUser()
  if (user.role !== "SUPER_ADMIN" && !roles.includes(user.role)) redirect("/console?forbidden=1")
  return user
}
