import { NextResponse } from "next/server"
import { anthropic } from "@/lib/ai"
import { auth } from "@/lib/auth"
import { aiPrincipalSchema } from "@/lib/grade-schemas"

export const runtime = "nodejs"

const MODEL = "claude-sonnet-4-6"

const SYSTEM_PROMPT = `You are a Nigerian K-12 school principal writing the final comment on a student's term report card.

Write 2-3 sentences (45-75 words). Tone: warm, parental, slightly formal. Acknowledge overall performance, name 1-2 strong subjects by name, name 1 area for growth by name if there is one below 50%, and close with an encouraging note. Reference position/class only if provided.

Do NOT use markdown, do NOT sign off ("Yours sincerely…"), do NOT invent details that aren't in the input.`

const WRITE_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = aiPrincipalSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const d = parsed.data
  const top = [...d.subjects].sort((a, b) => b.score - a.score).slice(0, 2)
  const weak = d.subjects.find((s) => s.score < 50)

  if (!process.env.ANTHROPIC_API_KEY) {
    const positionLine =
      d.position && d.positionOutOf
        ? `, placing ${d.position} of ${d.positionOutOf} in ${d.className}`
        : ` in ${d.className}`
    const topLine =
      top.length > 0
        ? ` ${d.studentName} continues to shine in ${top.map((t) => t.name).join(" and ")}.`
        : ""
    const weakLine = weak ? ` Extra attention on ${weak.name} will strengthen the overall result.` : ""
    const fallback = `${d.studentName} averaged ${d.average}% this term${positionLine}.${topLine}${weakLine} Keep up the consistent effort.`
    return NextResponse.json({ ok: true, comment: fallback, model: "heuristic-fallback" })
  }

  const lines = [
    `Student: ${d.studentName}`,
    `Class: ${d.className}`,
    `Overall average: ${d.average}%`,
    d.position && d.positionOutOf ? `Position: ${d.position} of ${d.positionOutOf}` : "",
    d.attendancePct != null ? `Attendance: ${d.attendancePct}%` : "",
    `Subjects (score · grade):`,
    ...d.subjects.map((s) => `  - ${s.name}: ${s.score}${s.letterGrade ? ` · ${s.letterGrade}` : ""}`),
  ].filter(Boolean)

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 220,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: lines.join("\n") }],
    })
    const text = res.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
    return NextResponse.json({ ok: true, comment: text, model: MODEL })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI failure"
    console.error("[ai/generate-principal-comment]", err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
