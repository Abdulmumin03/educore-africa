import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { generateInputSchema, generateQuestions } from "@/lib/ai/question-bank"
import {
  getCurriculumById,
  getDefaultCurriculum,
} from "@/lib/curriculum"

export const runtime = "nodejs"
export const maxDuration = 120

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

const bodySchema = generateInputSchema.extend({
  subjectId: z.string().trim().min(1).optional(),
  curriculumId: z.string().trim().min(1).optional(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const schoolId = session.user.schoolId
  const { subjectId, curriculumId, ...generateInput } = parsed.data

  // Resolution order: explicit curriculumId → subject's curriculum (if exactly
  // one) → school default.
  let curriculum = null
  if (curriculumId) {
    curriculum = await getCurriculumById(curriculumId, schoolId)
  }
  if (!curriculum && subjectId) {
    const links = await prisma.subjectCurriculum.findMany({
      where: { subjectId, curriculum: { schoolId, deletedAt: null } },
      select: { curriculumId: true },
    })
    if (links.length === 1) {
      curriculum = await getCurriculumById(links[0].curriculumId, schoolId)
    }
  }
  if (!curriculum) {
    curriculum = await getDefaultCurriculum(schoolId)
  }

  const res = await generateQuestions(generateInput, {
    curriculumHint: curriculum?.aiPromptHint ?? null,
  })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 })
  return NextResponse.json({
    ok: true,
    questions: res.questions,
    model: res.model,
    input: generateInput,
    curriculum: curriculum
      ? { id: curriculum.id, code: curriculum.code, name: curriculum.name }
      : null,
  })
}
