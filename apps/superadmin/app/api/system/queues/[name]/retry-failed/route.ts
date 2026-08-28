import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { retryFailed } from "@/lib/queues"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: { name: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN")
  if (forbidden) return forbidden

  let body: { jobId?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    // No body is fine: retry everything failed on the queue.
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : undefined
  const result = await retryFailed(params.name, jobId)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  await auditLog({
    userId: guard.user.id,
    action: "system.queue.retry",
    target: auditTarget("system", params.name),
    targetType: "system",
    ipAddress: guard.ipAddress,
    details: { queue: params.name, jobId: jobId ?? "all-failed", ...result },
  })

  return NextResponse.json(result)
}
