import { headers } from "next/headers"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { auditDiff, snapshot } from "@/lib/audit-utils"

// Re-export the pure helpers so existing callers keep working without
// having to know about the file split.
export { auditDiff, snapshot }

export type AuditAction = string // free-form: "create", "update", "delete", "issue", "approve", "grade-override", etc.

export type AuditInput = {
  schoolId: string | null
  userId: string | null
  action: AuditAction
  entityType: string // e.g. "Student", "Payment", "User", "BusRoute"
  entityId?: string | null
  /** Before/after snapshots for mutations. Pass plain objects; we'll diff them. */
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  /** Anything else worth keeping with the row. */
  metadata?: Record<string, unknown>
}

function readRequestContext(): { ipAddress: string | null; userAgent: string | null } {
  try {
    const h = headers()
    const ipAddress =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null
    const userAgent = h.get("user-agent")?.slice(0, 240) ?? null
    return { ipAddress, userAgent }
  } catch {
    // headers() throws outside a request scope; fine for tests/scripts.
    return { ipAddress: null, userAgent: null }
  }
}

/**
 * Write an audit row. Designed to be fire-and-forget — callers should NOT
 * await with a critical UI path blocked. Errors are logged and swallowed so
 * a downed audit log can't take a route offline.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  const { ipAddress, userAgent } = readRequestContext()
  const diff = auditDiff(input.before, input.after)
  const payload: Record<string, unknown> = {}
  if (diff) payload.changes = diff
  if (input.metadata) Object.assign(payload, input.metadata)

  try {
    await prisma.auditLog.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        ipAddress,
        userAgent,
        payload: Object.keys(payload).length
          ? (payload as Prisma.InputJsonValue)
          : undefined,
      },
    })
  } catch (err) {
    console.error("[audit] write failed", err, { input })
  }
}
