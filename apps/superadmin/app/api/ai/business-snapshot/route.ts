import { NextResponse } from "next/server"

import { RISK_MODEL, complete, isAIConfigured } from "@/lib/ai"
import {
  SNAPSHOT_CACHE_KEY,
  SNAPSHOT_CACHE_TTL_SECONDS,
  SNAPSHOT_SYSTEM,
  buildSnapshotPrompt,
  gatherSnapshotFacts,
  heuristicSummary,
  snapshotBody,
} from "@/lib/business-snapshot"
import { redis } from "@/lib/redis"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * The whole snapshot in one response.
 *
 * `/api/ai/business-snapshot/stream` writes the same thing token by token and
 * fills the same cache; this route is what the server component calls, where
 * streaming buys nothing.
 */
export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const refresh = new URL(request.url).searchParams.get("refresh") === "1"

  if (!refresh) {
    try {
      const hit = await redis.get(SNAPSHOT_CACHE_KEY)
      if (hit) return NextResponse.json({ ...JSON.parse(hit), cached: true })
    } catch {
      // Cache miss or Redis down — regenerate.
    }
  }

  const facts = await gatherSnapshotFacts()

  let text: string | null = null
  let source: "model" | "heuristic" = "heuristic"

  if (isAIConfigured()) {
    try {
      text = await complete({
        system: SNAPSHOT_SYSTEM,
        prompt: buildSnapshotPrompt(facts.payload),
        model: RISK_MODEL,
        maxTokens: 1200,
        effort: "medium",
      })
      if (text) source = "model"
    } catch (error) {
      console.error("[ai] business snapshot failed", error)
    }
  }

  if (!text) text = heuristicSummary(facts)

  const body = snapshotBody(facts, text, source, RISK_MODEL)

  try {
    await redis.set(SNAPSHOT_CACHE_KEY, JSON.stringify(body), "EX", SNAPSHOT_CACHE_TTL_SECONDS)
  } catch {
    // Non-fatal.
  }

  return NextResponse.json(body)
}
