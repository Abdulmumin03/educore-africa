import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import {
  generateLessonPlan,
  lessonPlanInputSchema,
  stepsToMarkdown,
} from "@/lib/ai/lesson-plan"

export const runtime = "nodejs"

const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

/**
 * POST /api/ai/generate-lesson-plan
 *
 * Body: { subject, classLevel, topic, durationMin }
 * Returns: { objectives, methodology, materials, steps, assessment, homework, contentMd }
 * The contentMd field renders `steps` as markdown so the form can plug it
 * straight into the Tiptap editor.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = lessonPlanInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const result = await generateLessonPlan(parsed.data)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    model: result.model,
    ...result.data,
    contentMd: stepsToMarkdown(result.data.steps),
  })
}
