import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { questionSchema } from "@/lib/ai/question-bank"

export const runtime = "nodejs"

const saveSchema = z.object({
  subjectId: z.string().cuid().optional(),
  subjectName: z.string().optional(),
  classLevel: z.string().min(1).max(40),
  topic: z.string().min(2).max(200),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  type: z.enum(["MCQ", "THEORY", "FILL_IN_BLANK", "TRUE_FALSE"]),
  model: z.string().optional(),
  questions: z.array(questionSchema).min(1).max(50),
})

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = saveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  // Resolve subjectId from name if not given.
  let subjectId = data.subjectId ?? null
  if (!subjectId && data.subjectName) {
    const subj = await prisma.subject.findFirst({
      where: {
        schoolId: session.user.schoolId,
        name: { contains: data.subjectName, mode: "insensitive" },
      },
      select: { id: true },
    })
    subjectId = subj?.id ?? null
  }

  const rows = data.questions.map((q) => ({
    schoolId: session.user.schoolId!,
    subjectId,
    classLevel: data.classLevel,
    topic: data.topic,
    difficulty: data.difficulty,
    type: data.type,
    question: q.question,
    options: q.options ?? undefined,
    answer: q.answer,
    explanation: q.explanation ?? null,
    model: data.model ?? null,
    tags: [data.topic, data.classLevel, data.difficulty],
  }))
  await prisma.questionBank.createMany({ data: rows })

  return NextResponse.json({ ok: true, saved: rows.length })
}
