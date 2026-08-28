import { NextResponse } from "next/server"

import { endpointStats, hourlyLatency } from "@/lib/api-metrics"
import { connectionPool, redisMemory } from "@/lib/infra-metrics"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "ENGINEERING_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  const [latency, endpoints, pool, memory] = await Promise.all([
    hourlyLatency(),
    endpointStats(),
    connectionPool(),
    redisMemory(),
  ])

  return NextResponse.json({
    latency,
    endpoints: endpoints.endpoints.slice(0, 15),
    pool,
    redis: memory,
    note: "Latency is sampled at the console's session guard — a floor on handler time, not the whole request.",
  })
}
