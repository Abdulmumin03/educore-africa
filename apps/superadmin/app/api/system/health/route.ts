import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"

export const dynamic = "force-dynamic"

// Liveness probe for the console itself. Unauthenticated by design so a load
// balancer can hit it, but it reports nothing beyond up/down.
export async function GET() {
  const checks: Record<string, "ok" | "down"> = { database: "down", redis: "down" }

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = "ok"
  } catch {
    // leave as down
  }

  try {
    await redis.ping()
    checks.redis = "ok"
  } catch {
    // leave as down
  }

  const healthy = Object.values(checks).every((value) => value === "ok")

  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks },
    { status: healthy ? 200 : 503 },
  )
}
