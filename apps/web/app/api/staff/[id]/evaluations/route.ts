import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveStaffAccess, canWriteStaff } from "@/lib/staff-access"
import { evaluationInputSchema, computeEvaluation } from "@/lib/staff-schemas"

export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const staff = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const rows = await prisma.evaluation.findMany({
    where: { staffId: staff.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      term: { include: { academicYear: { select: { name: true } } } },
      evaluator: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  })

  return NextResponse.json({
    items: rows.map((e) => ({
      id: e.id,
      status: e.status,
      termType: e.term.type,
      sessionName: e.term.academicYear.name,
      passRate: e.passRate,
      attendanceRate: e.attendanceRate,
      lessonPlanRate: e.lessonPlanRate,
      parentScore: e.parentScore,
      principalComment: e.principalComment,
      aiSummary: e.aiSummary,
      aiModel: e.aiModel,
      finalScore: e.finalScore,
      badge: e.badge,
      evaluatorName: e.evaluator
        ? `${e.evaluator.user.firstName} ${e.evaluator.user.lastName}`
        : null,
      finalizedAt: e.finalizedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response
  if (!canWriteStaff(access.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const staff = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true, userId: true, user: { select: { firstName: true, lastName: true } } },
  })
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = evaluationInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const d = parsed.data

  // Verify term belongs to the school.
  const term = await prisma.term.findFirst({
    where: { id: d.termId, academicYear: { schoolId: access.session.schoolId } },
    select: { id: true },
  })
  if (!term) return NextResponse.json({ error: "Invalid term" }, { status: 422 })

  const { finalScore, badge } = computeEvaluation({
    passRate: d.passRate ?? null,
    attendanceRate: d.attendanceRate ?? null,
    lessonPlanRate: d.lessonPlanRate ?? null,
    parentScore: d.parentScore ?? null,
  })

  const evaluatorStaff = await prisma.staff.findUnique({
    where: { userId: access.session.userId },
    select: { id: true },
  })

  const evaluation = await prisma.evaluation.upsert({
    where: { staffId_termId: { staffId: staff.id, termId: term.id } },
    create: {
      schoolId: access.session.schoolId,
      staffId: staff.id,
      termId: term.id,
      status: d.status,
      passRate: d.passRate ?? null,
      attendanceRate: d.attendanceRate ?? null,
      lessonPlanRate: d.lessonPlanRate ?? null,
      parentScore: d.parentScore ?? null,
      principalComment: d.principalComment || null,
      aiSummary: d.aiSummary || null,
      aiModel: d.aiModel || null,
      finalScore,
      badge,
      evaluatorId: evaluatorStaff?.id ?? null,
      finalizedAt: d.status === "FINAL" ? new Date() : null,
    },
    update: {
      status: d.status,
      passRate: d.passRate ?? null,
      attendanceRate: d.attendanceRate ?? null,
      lessonPlanRate: d.lessonPlanRate ?? null,
      parentScore: d.parentScore ?? null,
      principalComment: d.principalComment || null,
      aiSummary: d.aiSummary || null,
      aiModel: d.aiModel || null,
      finalScore,
      badge,
      evaluatorId: evaluatorStaff?.id ?? null,
      finalizedAt: d.status === "FINAL" ? new Date() : null,
    },
    select: { id: true },
  })

  if (d.status === "FINAL") {
    await prisma.notification.create({
      data: {
        schoolId: access.session.schoolId,
        userId: staff.userId,
        channel: "IN_APP",
        title: "Performance appraisal finalized",
        body: `Your appraisal for this term has been finalized${
          finalScore != null ? ` — final score ${finalScore}/100 (${badge}).` : "."
        }`,
        metadata: { evaluationId: evaluation.id },
        sentAt: new Date(),
      },
    })
  }

  return NextResponse.json({
    ok: true,
    id: evaluation.id,
    finalScore,
    badge,
  })
}
