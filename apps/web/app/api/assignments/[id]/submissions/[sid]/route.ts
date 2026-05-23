import { NextResponse } from "next/server"
import { z } from "zod"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/audit"

export const runtime = "nodejs"

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const bodySchema = z.object({
  score: z.number().nullable().optional(),
  feedback: z.string().max(4000).nullable().optional(),
})

/** PATCH /api/assignments/[id]/submissions/[sid] — grade a submission. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; sid: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const sub = await prisma.assignmentSubmission.findFirst({
    where: { id: params.sid, assignmentId: params.id, deletedAt: null },
    select: {
      id: true,
      score: true,
      feedback: true,
      studentId: true,
      assignment: {
        select: {
          schoolId: true,
          maxScore: true,
          teacher: { select: { userId: true } },
        },
      },
    },
  })
  if (!sub || sub.assignment.schoolId !== session.user.schoolId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const isAdmin = ADMIN_ROLES.includes(session.user.role)
  const isOwner = sub.assignment.teacher.userId === session.user.id
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { score, feedback } = parsed.data
  if (score !== undefined && score !== null) {
    if (score < 0 || score > sub.assignment.maxScore) {
      return NextResponse.json(
        { error: `Score must be between 0 and ${sub.assignment.maxScore}.` },
        { status: 422 },
      )
    }
  }

  const updated = await prisma.assignmentSubmission.update({
    where: { id: sub.id },
    data: {
      score: score ?? undefined,
      feedback: feedback === undefined ? undefined : feedback,
      gradedAt: score !== undefined && score !== null ? new Date() : undefined,
    },
    select: { id: true, score: true, gradedAt: true },
  })

  await logAudit({
    schoolId: session.user.schoolId,
    userId: session.user.id,
    action: "submission.grade",
    entityType: "AssignmentSubmission",
    entityId: sub.id,
    before: { score: sub.score, feedback: sub.feedback },
    after: { score: updated.score, feedback: feedback ?? sub.feedback },
    metadata: { assignmentId: params.id, studentId: sub.studentId },
  })

  return NextResponse.json({
    ok: true,
    id: updated.id,
    score: updated.score,
    gradedAt: updated.gradedAt?.toISOString() ?? null,
  })
}
