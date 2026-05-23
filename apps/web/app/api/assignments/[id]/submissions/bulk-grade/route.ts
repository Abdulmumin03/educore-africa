import { NextResponse } from "next/server"
import { z } from "zod"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const bodySchema = z.object({
  score: z.number(),
  studentIds: z.array(z.string().cuid()).min(1).max(200),
  feedback: z.string().max(4000).optional(),
})

/**
 * POST /api/assignments/[id]/submissions/bulk-grade
 *
 * Apply the same score (and optional feedback) to multiple students. Only
 * grades students who already submitted — skips others silently.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const a = await prisma.assignment.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: {
      id: true,
      maxScore: true,
      teacher: { select: { userId: true } },
    },
  })
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAdmin = ADMIN_ROLES.includes(session.user.role)
  const isOwner = a.teacher.userId === session.user.id
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
  const { score, studentIds, feedback } = parsed.data
  if (score < 0 || score > a.maxScore) {
    return NextResponse.json(
      { error: `Score must be between 0 and ${a.maxScore}.` },
      { status: 422 },
    )
  }

  const now = new Date()
  const result = await prisma.assignmentSubmission.updateMany({
    where: {
      assignmentId: a.id,
      studentId: { in: studentIds },
      deletedAt: null,
    },
    data: {
      score,
      feedback: feedback === undefined ? undefined : feedback,
      gradedAt: now,
    },
  })

  return NextResponse.json({ ok: true, updated: result.count })
}
