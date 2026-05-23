import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveGradeAccess } from "@/lib/grade-access"
import { buildMidtermReportData } from "@/lib/midterm-report"
import { anthropic } from "@/lib/ai"

export const runtime = "nodejs"

const MODEL = "claude-sonnet-4-6"

// Midterm comments are interim — shorter than the term-end comment, focused on
// trajectory and what to address before the term exam. ~30-40 words.
const SYSTEM_PROMPT = `You are a school principal writing a brief midterm comment for a student. Write ONE sentence (30-45 words). Tone: warm, parental, encouraging. Note the student's current progress, name 1-2 strong subjects by name, and (only if average < 50%) flag one area to focus on before the end-of-term exam. No markdown, no sign-off. Do not invent details — work only from the data provided.`

/**
 * POST /api/grades/midterm-reports/[studentId]/ai-comment?termId=X
 *
 * Generates a Sonnet-backed principal comment for the student's midterm
 * report and persists it to MidtermReport.principalComment (aiPrincipal=true).
 * Refuses if the row is locked. Privileged roles only.
 */
export async function POST(req: Request, { params }: { params: { studentId: string } }) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response
  if (!access.isPrivileged) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const termId = url.searchParams.get("termId")
  if (!termId) return NextResponse.json({ error: "termId required" }, { status: 422 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 })
  }

  const data = await buildMidtermReportData({
    schoolId: access.session.schoolId,
    studentId: params.studentId,
    termId,
  })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Refuse on locked rows (matches PATCH behaviour).
  const existing = await prisma.midtermReport.findUnique({
    where: { studentId_termId: { studentId: params.studentId, termId } },
    select: { id: true, lockedAt: true },
  })
  if (existing?.lockedAt) {
    return NextResponse.json({ error: "Report is locked" }, { status: 409 })
  }

  const lines = [
    `Student: ${data.student.firstName} ${data.student.lastName}`,
    `Class: ${data.student.className} · Arm ${data.student.sectionName}`,
    `Midterm average: ${data.totals.average.toFixed(1)}`,
    `Subjects sat: ${data.totals.subjectCount}`,
    data.attendance.percent !== null ? `Attendance: ${data.attendance.percent}%` : "",
    `Components counted: ${data.midtermComponents.join(", ") || "(none)"}`,
    `Per-subject midterm totals:`,
    ...data.subjects.map((s) => `  - ${s.name}: ${s.midtermTotal.toFixed(1)}`),
  ].filter(Boolean)

  let text: string | null = null
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: lines.join("\n") }],
    })
    text = res.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
  } catch (err) {
    console.error("[midterm/ai-comment] failed", err)
    return NextResponse.json({ error: "AI generation failed" }, { status: 502 })
  }
  if (!text) return NextResponse.json({ error: "Empty AI response" }, { status: 502 })

  await prisma.midtermReport.upsert({
    where: { studentId_termId: { studentId: params.studentId, termId } },
    create: {
      schoolId: access.session.schoolId,
      studentId: params.studentId,
      termId,
      principalComment: text,
      aiPrincipal: true,
      generatedById: access.session.userId,
    },
    update: {
      principalComment: text,
      aiPrincipal: true,
    },
  })

  return NextResponse.json({ ok: true, principalComment: text, aiPrincipal: true })
}
