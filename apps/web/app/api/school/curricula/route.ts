import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"
import { gradingSettingsSchema } from "@/lib/school-settings"
import { EXAM_BODY_CODES } from "@/lib/curriculum-presets"
import { listCurricula } from "@/lib/curriculum"

export const runtime = "nodejs"

const createSchema = z.object({
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, _ or -"),
  name: z.string().trim().min(2).max(80),
  examBodyCode: z.enum(EXAM_BODY_CODES),
  aiPromptHint: z.string().trim().max(2000).optional(),
  gradingScale: gradingSettingsSchema,
  isDefault: z.boolean().optional(),
})

export async function GET() {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response
  const rows = await listCurricula(g.session.user.schoolId)
  return NextResponse.json({ ok: true, curricula: rows })
}

export async function POST(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 422 })
  }
  const schoolId = g.session.user.schoolId

  const collision = await prisma.curriculum.findFirst({
    where: { schoolId, code: parsed.data.code, deletedAt: null },
  })
  if (collision) {
    return NextResponse.json({ error: "Curriculum code already exists" }, { status: 409 })
  }

  const existingDefault = await prisma.curriculum.findFirst({
    where: { schoolId, isDefault: true, deletedAt: null },
  })

  const cur = await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault && existingDefault) {
      await tx.curriculum.update({
        where: { id: existingDefault.id },
        data: { isDefault: false },
      })
    }
    return tx.curriculum.create({
      data: {
        schoolId,
        code: parsed.data.code,
        name: parsed.data.name,
        examBodyCode: parsed.data.examBodyCode,
        aiPromptHint: parsed.data.aiPromptHint ?? null,
        gradingScale: parsed.data.gradingScale,
        isDefault: parsed.data.isDefault ?? !existingDefault,
      },
    })
  })

  return NextResponse.json({ ok: true, id: cur.id })
}
