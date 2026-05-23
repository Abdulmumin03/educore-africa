import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { resolveGradeAccess } from "@/lib/grade-access"

export const runtime = "nodejs"

const PRIVILEGED = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] as const

const patchSchema = z
  .object({
    classTeacherComment: z.string().trim().max(2000).nullable().optional(),
    principalComment: z.string().trim().max(2000).nullable().optional(),
    aiPrincipal: z.boolean().optional(),
    lockAction: z.enum(["lock", "unlock"]).optional(),
  })
  .refine(
    (v) =>
      v.classTeacherComment !== undefined ||
      v.principalComment !== undefined ||
      v.lockAction !== undefined,
    { message: "no-op patch" },
  )

/**
 * Edit teacher / principal comments on a generated ReportCard, and
 * lock / unlock it. Locking freezes comments — subsequent bulk-generate
 * runs skip locked rows. Only privileged roles (admin / principal) can
 * lock or unlock.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const existing = await prisma.reportCard.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true, lockedAt: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (existing.lockedAt && parsed.data.lockAction !== "unlock") {
    return NextResponse.json(
      { error: "Report card is locked — unlock first to edit" },
      { status: 409 },
    )
  }

  if (
    parsed.data.lockAction &&
    !PRIVILEGED.includes(access.session.role as (typeof PRIVILEGED)[number])
  ) {
    return NextResponse.json({ error: "Only admins/principals can lock" }, { status: 403 })
  }

  const next: Parameters<typeof prisma.reportCard.update>[0]["data"] = {}
  if (parsed.data.classTeacherComment !== undefined) {
    next.classTeacherComment = parsed.data.classTeacherComment || null
  }
  if (parsed.data.principalComment !== undefined) {
    next.principalComment = parsed.data.principalComment || null
    // If the user is overwriting the principal comment manually, flip the flag.
    if (parsed.data.aiPrincipal === undefined) next.aiPrincipal = false
  }
  if (parsed.data.aiPrincipal !== undefined) next.aiPrincipal = parsed.data.aiPrincipal
  if (parsed.data.lockAction === "lock") next.lockedAt = new Date()
  if (parsed.data.lockAction === "unlock") next.lockedAt = null

  const updated = await prisma.reportCard.update({
    where: { id: existing.id },
    data: next,
    select: {
      id: true,
      classTeacherComment: true,
      principalComment: true,
      aiPrincipal: true,
      lockedAt: true,
    },
  })

  return NextResponse.json({ ok: true, reportCard: updated })
}
