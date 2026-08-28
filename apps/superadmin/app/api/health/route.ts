import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const VERSION = process.env.APP_VERSION ?? "1.0.0"

/**
 * GET /api/health — the canonical probe.
 *
 * Unauthenticated and exempt from the IP allowlist by design: the container
 * runtime, the load balancer and the deploy smoke test all call it, and none
 * of them are on the office network. It reveals nothing beyond up/down and a
 * build stamp.
 *
 * 200 when both backends answer, 503 when either does not, so an orchestrator
 * can act on the status code without parsing the body.
 *
 * `/api/system/health` predates this and stays as an alias — the SA-03 shell
 * checks already call it.
 */
export async function GET() {
  const startedAt = Date.now()

  const [db, cache] = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => "ok" as const)
      .catch(() => "down" as const),
    redis
      .ping()
      .then((reply) => (reply === "PONG" ? ("ok" as const) : ("down" as const)))
      .catch(() => "down" as const),
  ])

  const healthy = db === "ok" && cache === "ok"

  return NextResponse.json(
    {
      status: healthy ? "ok" : "down",
      db,
      redis: cache,
      version: VERSION,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  )
}
