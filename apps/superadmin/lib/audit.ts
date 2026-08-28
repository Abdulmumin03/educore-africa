import { headers } from "next/headers"

import { prisma } from "@/lib/db"
import { clientIp } from "@/lib/ip"

export type AuditTargetType =
  | "school"
  | "user"
  | "payment"
  | "config"
  | "ticket"
  | "session"
  | "system"

// Auth events. Free-form strings elsewhere in the console, but auth is a
// closed set so the audit screen can filter on it reliably.
export const AUTH_ACTIONS = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  MFA_SUCCESS: "MFA_SUCCESS",
  MFA_FAILED: "MFA_FAILED",
  MFA_ENROLLED: "MFA_ENROLLED",
  BACKUP_CODE_USED: "BACKUP_CODE_USED",
  DEVICE_TRUSTED: "DEVICE_TRUSTED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  IP_BLOCKED: "IP_BLOCKED",
  LOGOUT: "LOGOUT",
} as const

export type AuthAction = (typeof AUTH_ACTIONS)[keyof typeof AUTH_ACTIONS]

export type AuditInput = {
  /** Null for pre-auth events: a blocked IP or an unknown email has no account. */
  userId?: string | null
  action: AuthAction | string
  target: string
  targetType: AuditTargetType
  details?: Record<string, unknown>
  /** Pass explicitly from route handlers; falls back to the request headers. */
  ipAddress?: string
}

function requestIp(): string {
  try {
    return clientIp(headers())
  } catch {
    // headers() throws outside a request scope (scripts, tests).
    return "unknown"
  }
}

/**
 * Write a super-admin audit row.
 *
 * Called explicitly from every auth event and every mutating action — not
 * middleware — so the recorded verb describes intent rather than an HTTP
 * method. Failures are logged and swallowed: a downed audit table must never
 * take the console offline or, worse, block a logout.
 */
export async function auditLog(input: AuditInput): Promise<void> {
  try {
    await prisma.superAdminAuditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        target: input.target,
        targetType: input.targetType,
        details: (input.details ?? undefined) as never,
        ipAddress: input.ipAddress ?? requestIp(),
      },
    })
  } catch (error) {
    console.error("[audit] failed to write super-admin audit row", error)
  }
}

/** Convenience for building the `target` string. */
export function auditTarget(type: AuditTargetType, id: string) {
  return `${type}:${id}`
}
