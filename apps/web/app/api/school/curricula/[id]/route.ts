import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"
import { gradingSettingsSchema } from "@/lib/school-settings"
import { EXAM_BODY_CODES } from "@/lib/curriculum-presets"

export const runtime = "nodejs"

const patchSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(30)
      .regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, _ or -")
      .optional(),
    name: z.string().trim().min(2).max(80).optional(),
    examBodyCode: z.enum(EXAM_BODY_CODES).optional(),
    aiPromptHint: z.string().trim().max(2000).nullable().optional(),
    gradingScale: gradingSettingsSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" })

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 422 })
  }
  const schoolId = g.session.user.schoolId

  const cur = await prisma.curriculum.findFirst({
    where: { id: params.id, schoolId, deletedAt: null },
  })
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (parsed.data.code && parsed.data.code !== cur.code) {
    const collision = await prisma.curriculum.findFirst({
      where: {
        schoolId,
        code: parsed.data.code,
        deletedAt: null,
        NOT: { id: cur.id },
      },
    })
    if (collision) {
      return NextResponse.json({ error: "Curriculum code already exists" }, { status: 409 })
    }
  }

  // Promoting to default — un-default any existing default first.
  if (parsed.data.isDefault === true && !cur.isDefault) {
    await prisma.curriculum.updateMany({
      where: { schoolId, isDefault: true, deletedAt: null },
      data: { isDefault: false },
    })
  }

  // Demoting current default — refuse unless another one is being promoted in this request.
  if (parsed.data.isDefault === false && cur.isDefault) {
    return NextResponse.json(
      { error: "Promote another curriculum to default first" },
      { status: 409 },
    )
  }

  const { aiPromptHint, ...rest } = parsed.data
  const data: Record<string, unknown> = { ...rest }
  if (aiPromptHint !== undefined) data.aiPromptHint = aiPromptHint

  await prisma.curriculum.update({ where: { id: cur.id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const cur = await prisma.curriculum.findFirst({
    where: { id: params.id, schoolId: g.session.user.schoolId, deletedAt: null },
  })
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (cur.isDefault) {
    return NextResponse.json({ error: "Default curriculum cannot be deleted" }, { status: 409 })
  }

  const [classCount, subjectCount] = await Promise.all([
    prisma.class.count({ where: { curriculumId: cur.id, deletedAt: null } }),
    prisma.subjectCurriculum.count({ where: { curriculumId: cur.id } }),
  ])
  if (classCount > 0 || subjectCount > 0) {
    return NextResponse.json(
      {
        error: `In use by ${classCount} class(es) and ${subjectCount} subject(s)`,
      },
      { status: 409 },
    )
  }

  await prisma.curriculum.update({
    where: { id: cur.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
