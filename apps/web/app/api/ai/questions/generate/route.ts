import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateInputSchema, generateQuestions } from "@/lib/ai/question-bank"

export const runtime = "nodejs"
export const maxDuration = 120

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = generateInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const res = await generateQuestions(parsed.data)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 })
  return NextResponse.json({
    ok: true,
    questions: res.questions,
    model: res.model,
    input: parsed.data,
  })
}
