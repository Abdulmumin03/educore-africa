import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { executeDeletion, listDeletionRecords } from "@/lib/compliance"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN", "SUPPORT_ADMIN")
  if (forbidden) return forbidden

  return NextResponse.json({ records: await listDeletionRecords() })
}

/**
 * Execute an erasure.
 *
 * SUPER_ADMIN only, and irreversible. The confirmation phrase is not
 * decoration: this is the one action in the console that destroys data
 * nothing can restore, and it should not be reachable by a mis-click.
 */
export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user)
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const requestId = typeof body.requestId === "string" ? body.requestId : ""
  const userId = typeof body.userId === "string" ? body.userId : ""
  const confirm = typeof body.confirm === "string" ? body.confirm.trim().toUpperCase() : ""

  if (!requestId || !userId) {
    return NextResponse.json({ error: "requestId and userId are required." }, { status: 400 })
  }
  if (confirm !== "ERASE") {
    return NextResponse.json(
      { error: 'Type ERASE to confirm. This anonymises the subject permanently and cannot be undone.' },
      { status: 400 },
    )
  }

  const result = await executeDeletion({ requestId, userId, executedById: guard.user.id })
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 })

  await auditLog({
    userId: guard.user.id,
    action: "compliance.deletion.execute",
    target: auditTarget("user", userId),
    targetType: "user",
    ipAddress: guard.ipAddress,
    details: { requestId, method: result.method, summary: result.summary },
  })

  return NextResponse.json({
    ok: true,
    summary: result.summary,
    method: result.method,
    notice:
      "Identifying fields were removed and the account disabled. Academic and financial rows were kept without attribution — deleting them would erase the school's own records.",
  })
}
