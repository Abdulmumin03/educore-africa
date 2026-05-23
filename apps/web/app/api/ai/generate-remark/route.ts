import { NextResponse } from "next/server"
import crypto from "node:crypto"
import { anthropic } from "@/lib/ai"
import { auth } from "@/lib/auth"
import { redis } from "@/lib/redis"
import { aiRemarkSchema } from "@/lib/grade-schemas"

export const runtime = "nodejs"

const MODEL = "claude-sonnet-4-6"
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days per spec

const SYSTEM_PROMPT = `You write per-subject teacher remarks for Nigerian K-12 report cards.

Write ONE short sentence (12-25 words). Tone: warm, specific, professional. Reference the actual numbers when material. Compare to class average ONLY if it's provided. End with a forward-looking note ("Keep it up", "Aim higher next term", "Show your working", etc) appropriate to performance.

Do NOT use markdown, do NOT invent grades, do NOT start with "Dear" or sign off.`

const WRITE_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

function cacheKey(input: Record<string, unknown>): string {
  const hash = crypto
    .createHash("sha1")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16)
  return `ai:remark:${hash}`
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = aiRemarkSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const d = parsed.data

  // Redis cache: key = sha1 of inputs (school-scoped via schoolId mixed in).
  const key = cacheKey({ schoolId: session.user.schoolId, ...d })
  try {
    const cached = await redis.get(key)
    if (cached) {
      const parsedCache = JSON.parse(cached) as { remark: string; model: string }
      return NextResponse.json({ ok: true, ...parsedCache, cached: true })
    }
  } catch {
    // Redis unreachable — proceed without cache.
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    const fallback =
      d.score >= 75
        ? `Excellent grasp of ${d.subject} (${d.score}%)${d.letterGrade ? ` — ${d.letterGrade}` : ""}. Keep it up.`
        : d.score >= 50
          ? `Solid effort in ${d.subject} (${d.score}%). Aim higher next term.`
          : `${d.subject} needs more focus (${d.score}%). Daily practice and review will help.`
    return NextResponse.json({ ok: true, remark: fallback, model: "heuristic-fallback" })
  }

  const lines = [
    `Student: ${d.studentName}`,
    `Subject: ${d.subject}`,
    `Score: ${d.score}/100${d.letterGrade ? ` (${d.letterGrade})` : ""}`,
    d.classAverage != null ? `Class average: ${d.classAverage}` : "",
    d.trend ? `Trend vs last term: ${d.trend}` : "",
  ].filter(Boolean)

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 120,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: lines.join("\n") }],
    })
    const text = res.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .replace(/^["'`]|["'`]$/g, "")
    try {
      await redis.set(key, JSON.stringify({ remark: text, model: MODEL }), "EX", CACHE_TTL_SECONDS)
    } catch {
      // Cache write failure is non-fatal.
    }
    return NextResponse.json({ ok: true, remark: text, model: MODEL, cached: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI failure"
    console.error("[ai/generate-remark]", err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
