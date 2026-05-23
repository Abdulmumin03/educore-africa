import { NextResponse } from "next/server"
import { z } from "zod"
import { anthropic } from "@/lib/ai"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const SUGGESTIONS_MODEL = "claude-sonnet-4-6"

const inputSchema = z.object({
  staffId: z.string().cuid(),
})

const SYSTEM_PROMPT = `You suggest professional development training for K-12 school staff in Nigeria. Return EXACTLY 5 specific, actionable training topics tailored to the staff member's role, department, subjects taught, and any gaps suggested by their recent appraisal scores.

Output strict JSON: {"suggestions":[{"title":"...","rationale":"one sentence"}, ...]} — no markdown, no commentary outside the JSON. Each title under 70 characters. Each rationale under 120 characters. Skip generic items like "Time management 101"; be concrete (e.g. "WAEC Mathematics paper marking calibration"). Do not invent details not implied by the input.`

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId) {
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  }

  const parsed = inputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 })

  const staff = await prisma.staff.findFirst({
    where: { id: parsed.data.staffId, schoolId: session.user.schoolId, deletedAt: null },
    include: {
      user: { select: { firstName: true, lastName: true, role: true } },
      subjects: { include: { subject: { select: { name: true } } } },
      trainings: { where: { deletedAt: null }, take: 10, orderBy: { startDate: "desc" } },
      evaluations: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { passRate: true, attendanceRate: true, lessonPlanRate: true, parentScore: true, principalComment: true, badge: true, finalScore: true },
      },
    },
  })
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 },
    )
  }

  const recentTrainings = staff.trainings.map((t) => t.title)
  const latestEval = staff.evaluations[0]
  const prompt = [
    `Name: ${staff.user.firstName} ${staff.user.lastName}`,
    `Role: ${staff.user.role}`,
    `Staff type: ${staff.staffType}`,
    staff.department ? `Department: ${staff.department}` : "",
    `Years of experience: ${staff.experienceYears}`,
    staff.qualification ? `Qualification: ${staff.qualification}` : "",
    staff.subjects.length > 0
      ? `Subjects taught: ${staff.subjects.map((s) => s.subject.name).join(", ")}`
      : "",
    recentTrainings.length > 0
      ? `Already completed (avoid duplicates): ${recentTrainings.join("; ")}`
      : "No prior training logged.",
    latestEval
      ? `Latest appraisal scores — pass:${latestEval.passRate ?? "n/a"} att:${latestEval.attendanceRate ?? "n/a"} lessons:${latestEval.lessonPlanRate ?? "n/a"} parent:${latestEval.parentScore ?? "n/a"} final:${latestEval.finalScore ?? "n/a"}/100 (${latestEval.badge ?? "—"})`
      : "No appraisal yet.",
    latestEval?.principalComment ? `Principal comment: ${latestEval.principalComment}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  try {
    const response = await anthropic.messages.create({
      model: SUGGESTIONS_MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    })
    const text = response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()

    let suggestions: { title: string; rationale: string }[] = []
    try {
      // Strip code fences just in case the model wrapped JSON.
      const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
      const parsedJson = JSON.parse(cleaned)
      if (Array.isArray(parsedJson.suggestions)) suggestions = parsedJson.suggestions
    } catch {
      // Fall back to splitting by line if parsing fails.
      suggestions = text
        .split(/\n+/)
        .filter((l) => l.trim().length > 0)
        .slice(0, 5)
        .map((l) => ({ title: l.replace(/^[-\d.\s)]+/, "").slice(0, 70), rationale: "" }))
    }

    return NextResponse.json({
      ok: true,
      model: SUGGESTIONS_MODEL,
      suggestions: suggestions.slice(0, 5),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI failure"
    console.error("[ai/training-suggestions]", err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
