import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(200),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  type: z.string().max(100),
})

const bodySchema = z
  .object({
    textContent: z.string().max(20000).optional(),
    attachments: z.array(attachmentSchema).max(10).optional(),
  })
  .refine((v) => !!v.textContent?.trim() || (v.attachments && v.attachments.length > 0), {
    message: "Provide text or at least one attachment",
  })

/**
 * POST /api/assignments/[id]/submit — student submits their work.
 *
 * One submission per (assignmentId, studentId). Re-submitting before grading
 * updates the existing record. After grading the submission is locked.
 * Enforces `allowLate` against `dueDate`.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Only students can submit" }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { textContent, attachments } = parsed.data

  const student = await prisma.student.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      enrollments: {
        where: { isActive: true, deletedAt: null },
        select: { sectionId: true },
        take: 1,
      },
    },
  })
  if (!student) return NextResponse.json({ error: "No student profile" }, { status: 403 })
  const mySection = student.enrollments[0]?.sectionId
  if (!mySection) {
    return NextResponse.json({ error: "No active enrolment" }, { status: 403 })
  }

  const a = await prisma.assignment.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true, sectionIds: true, dueDate: true, allowLate: true },
  })
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!a.sectionIds.includes(mySection)) {
    return NextResponse.json({ error: "Not assigned to you" }, { status: 403 })
  }

  const now = new Date()
  const isLate = a.dueDate.getTime() < now.getTime()
  if (isLate && !a.allowLate) {
    return NextResponse.json(
      { error: "Past due — late submissions disabled for this assignment." },
      { status: 409 },
    )
  }

  const existing = await prisma.assignmentSubmission.findFirst({
    where: { assignmentId: a.id, studentId: student.id, deletedAt: null },
    select: { id: true, gradedAt: true },
  })
  if (existing?.gradedAt) {
    return NextResponse.json(
      { error: "Already graded — re-submission not allowed." },
      { status: 409 },
    )
  }

  const data = {
    textContent: textContent?.trim() || null,
    attachments: (attachments ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
    fileUrl: attachments?.[0]?.url ?? null,
    submittedAt: now,
  }

  if (existing) {
    await prisma.assignmentSubmission.update({
      where: { id: existing.id },
      data,
    })
    return NextResponse.json({ ok: true, id: existing.id, replaced: true })
  }
  const created = await prisma.assignmentSubmission.create({
    data: {
      assignmentId: a.id,
      studentId: student.id,
      ...data,
    },
    select: { id: true },
  })
  return NextResponse.json({ ok: true, id: created.id, replaced: false }, { status: 201 })
}
