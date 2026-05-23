import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"
import { schoolSettingsSchema } from "@/lib/school-settings"

export const runtime = "nodejs"

export async function PATCH(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = schoolSettingsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  await prisma.school.update({
    where: { id: g.session.user.schoolId },
    data: { settings: parsed.data },
  })

  await prisma.auditLog.create({
    data: {
      schoolId: g.session.user.schoolId,
      userId: g.session.user.id,
      action: "SCHOOL_SETTINGS_UPDATED",
      entityType: "School",
      entityId: g.session.user.schoolId,
    },
  })

  return NextResponse.json({ ok: true })
}
