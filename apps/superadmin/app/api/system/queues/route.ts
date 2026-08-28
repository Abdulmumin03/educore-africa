import { NextResponse } from "next/server"

import { failedJobs, queueSnapshots } from "@/lib/queues"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN")
  if (forbidden) return forbidden

  const params = new URL(request.url).searchParams
  const snapshot = await queueSnapshots()

  // The failed-jobs panel asks for one queue at a time; loading every queue's
  // failures on the index would fetch job payloads nobody is looking at.
  const failedFor = params.get("failed")
  const failed = failedFor ? await failedJobs(failedFor) : []

  return NextResponse.json({ ...snapshot, failed, failedQueue: failedFor })
}
