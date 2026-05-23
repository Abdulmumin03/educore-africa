import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VERSION = process.env.APP_VERSION ?? "1.0.0"

type Status = "ok" | "degraded" | "down"

/**
 * GET /api/health — liveness + readiness in one endpoint.
 *
 *   - Pings Postgres via a `SELECT 1`
 *   - Pings Redis via `PING`
 *   - Reports the build version and ISO timestamp
 *
 * Returns 200 with `status: "ok"` when both backends respond.
 * Returns 503 with `status: "down"` when either fails — used by Docker
 * HEALTHCHECK and Railway/Render readiness probes.
 */
export async function GET() {
  const startedAt = Date.now()

  const [db, redisStatus] = await Promise.all([
    checkDb(),
    checkRedis(),
  ])

  const overall: Status =
    db === "connected" && redisStatus === "connected"
      ? "ok"
      : db === "down" || redisStatus === "down"
        ? "down"
        : "degraded"

  const body = {
    status: overall,
    db,
    redis: redisStatus,
    version: VERSION,
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
  }

  return NextResponse.json(body, {
    status: overall === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  })
}

async function checkDb(): Promise<"connected" | "down"> {
  try {
    // $queryRaw is cheaper than any model query — no table touch required.
    await prisma.$queryRaw`SELECT 1`
    return "connected"
  } catch (err) {
    console.error("[health] db check failed", err)
    return "down"
  }
}

async function checkRedis(): Promise<"connected" | "down"> {
  try {
    const reply = await redis.ping()
    return reply === "PONG" ? "connected" : "down"
  } catch (err) {
    console.error("[health] redis check failed", err)
    return "down"
  }
}
