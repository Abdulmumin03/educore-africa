import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { buildRiskInputs, scoreStudents, persistRiskScores } from "@/lib/ai/risk-scoring"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Weekly cron: recompute risk scores for every school. Suggested cadence:
 *
 *   Vercel `vercel.json`:
 *     { "crons": [{ "path": "/api/cron/ai/risk-scoring", "schedule": "0 6 * * 1" }] }
 *
 *   Self-hosted (crontab):
 *     0 6 * * 1 curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" \
 *       https://app.educore.africa/api/cron/ai/risk-scoring >/dev/null
 */
async function handle(req: Request) {
  const expected = process.env.CRON_SECRET
  if (expected) {
    const header = req.headers.get("x-cron-secret")
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (header !== expected && bearer !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }

  const schools = await prisma.school.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, slug: true },
  })

  const results: Array<{ schoolId: string; scored: number; model: string }> = []
  for (const school of schools) {
    const inputs = await buildRiskInputs(school.id)
    if (inputs.length === 0) continue
    const { items, model } = await scoreStudents(inputs)
    const saved = await persistRiskScores(school.id, inputs, items, model)
    results.push({ schoolId: school.id, scored: saved, model })
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    schools: results.length,
    totalScored: results.reduce((acc, r) => acc + r.scored, 0),
    results,
  })
}

export const POST = handle
export const GET = handle
