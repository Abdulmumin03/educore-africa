import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateTimetable, timetableInputSchema } from "@/lib/ai/timetable"

export const runtime = "nodejs"
export const maxDuration = 120

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = timetableInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const result = await generateTimetable(parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })

  return NextResponse.json({
    ok: true,
    model: result.model,
    slots: result.slots,
    conflicts: result.conflicts,
    warnings: result.warnings,
  })
}
