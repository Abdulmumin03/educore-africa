import { NextResponse } from "next/server"
import { z } from "zod"
import { anthropic } from "@/lib/ai"
import { auth } from "@/lib/auth"
import { computeEvaluation } from "@/lib/staff-schemas"

export const runtime = "nodejs"

const APPRAISAL_MODEL = "claude-sonnet-4-6"

const inputSchema = z.object({
  staffName: z.string().min(1).max(120),
  role: z.string().max(60).optional(),
  department: z.string().max(80).optional(),
  termLabel: z.string().max(60).optional(),
  subjects: z.array(z.string()).max(20).optional(),
  scores: z.object({
    passRate: z.number().min(0).max(1).nullable().optional(),
    attendanceRate: z.number().min(0).max(1).nullable().optional(),
    lessonPlanRate: z.number().min(0).max(1).nullable().optional(),
    parentScore: z.number().min(1).max(5).nullable().optional(),
  }),
  principalComment: z.string().max(2000).optional().or(z.literal("")),
})

const SYSTEM_PROMPT = `You are a senior HR partner at a Nigerian K-12 school writing a brief, professional performance appraisal summary for a teacher or staff member.

Write ONE paragraph (90-130 words). Tone: balanced, specific, encouraging but honest. Reference the actual numbers when material. Avoid generic praise. End with one concrete development suggestion. Do NOT use bullet points or markdown headings — just prose. Do NOT invent details that aren't in the input.`

function formatScoresForPrompt(input: z.infer<typeof inputSchema>): string {
  const { scores } = input
  const lines: string[] = []
  lines.push(`Name: ${input.staffName}`)
  if (input.role) lines.push(`Role: ${input.role}`)
  if (input.department) lines.push(`Department: ${input.department}`)
  if (input.termLabel) lines.push(`Term: ${input.termLabel}`)
  if (input.subjects && input.subjects.length)
    lines.push(`Subjects: ${input.subjects.join(", ")}`)
  if (scores.passRate != null)
    lines.push(`Student pass rate: ${Math.round(scores.passRate * 100)}%`)
  if (scores.attendanceRate != null)
    lines.push(`Attendance rate: ${Math.round(scores.attendanceRate * 100)}%`)
  if (scores.lessonPlanRate != null)
    lines.push(`Lesson plan submission rate: ${Math.round(scores.lessonPlanRate * 100)}%`)
  if (scores.parentScore != null)
    lines.push(`Parent feedback (1-5): ${scores.parentScore.toFixed(1)}`)
  const { finalScore, badge } = computeEvaluation(scores)
  if (finalScore != null) lines.push(`Computed final score: ${finalScore}/100 (${badge})`)
  if (input.principalComment) lines.push(`Principal comment: ${input.principalComment}`)
  return lines.join("\n")
}

const WRITE_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] as const

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId) {
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  }
  if (!WRITE_ROLES.includes(session.user.role as (typeof WRITE_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = inputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 },
    )
  }

  const { finalScore, badge } = computeEvaluation(parsed.data.scores)

  try {
    const response = await anthropic.messages.create({
      model: APPRAISAL_MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Write the appraisal summary based on these scores:\n\n${formatScoresForPrompt(parsed.data)}`,
        },
      ],
    })
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()

    return NextResponse.json({
      ok: true,
      summary: text,
      finalScore,
      badge,
      model: APPRAISAL_MODEL,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI failure"
    console.error("[ai/generate-appraisal]", err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
