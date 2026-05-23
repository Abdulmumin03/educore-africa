import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { buildRiskInputs, scoreStudents, persistRiskScores } from "@/lib/ai/risk-scoring"

export const runtime = "nodejs"
export const maxDuration = 300

const RUN_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "COUNSELOR"]

/**
 * Compute + persist a fresh batch of risk scores for every active student in
 * the school. Idempotent — leaves prior scores in place so the table builds
 * a history.
 */
export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!RUN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const inputs = await buildRiskInputs(session.user.schoolId)
  if (inputs.length === 0) {
    return NextResponse.json({ ok: true, scored: 0, note: "No active term or no students" })
  }
  const { items, model } = await scoreStudents(inputs)
  const saved = await persistRiskScores(session.user.schoolId, inputs, items, model)

  return NextResponse.json({
    ok: true,
    scored: saved,
    model,
    summary: items.reduce(
      (acc, i) => ({ ...acc, [i.level]: (acc[i.level] ?? 0) + 1 }),
      { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<string, number>,
    ),
  })
}
