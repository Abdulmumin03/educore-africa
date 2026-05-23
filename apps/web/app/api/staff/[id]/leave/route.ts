import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveStaffAccess } from "@/lib/staff-access"
import { applyLeaveSchema } from "@/lib/staff-schemas"

export const runtime = "nodejs"

function daysBetweenInclusive(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime()
  return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1)
}

/**
 * Apply for leave on behalf of a staff member. Staff can only apply for
 * themselves; admins/principals can apply on behalf of anyone.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const target = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true, userId: true, user: { select: { firstName: true, lastName: true } } },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isSelf = target.userId === access.session.userId
  const canApplyForOthers = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(access.session.role)
  if (!isSelf && !canApplyForOthers) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = applyLeaveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { leaveType, startDate, endDate, reason, attachmentUrl } = parsed.data

  const start = new Date(startDate)
  const end = new Date(endDate)
  const daysRequested = daysBetweenInclusive(start, end)

  const request = await prisma.leaveRequest.create({
    data: {
      schoolId: access.session.schoolId,
      staffId: target.id,
      leaveType,
      startDate: start,
      endDate: end,
      daysRequested,
      reason,
      attachmentUrl: attachmentUrl || null,
      status: "PENDING",
    },
    select: { id: true },
  })

  // Notify principals/admins of the new request.
  const approvers = await prisma.user.findMany({
    where: {
      schoolId: access.session.schoolId,
      role: { in: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  })
  if (approvers.length > 0) {
    await prisma.notification.createMany({
      data: approvers.map((u) => ({
        schoolId: access.session.schoolId,
        userId: u.id,
        channel: "IN_APP" as const,
        title: "Leave request awaiting review",
        body: `${target.user.firstName} ${target.user.lastName} requested ${daysRequested} day(s) of ${leaveType.toLowerCase()} leave.`,
        metadata: { leaveRequestId: request.id, staffId: target.id },
        sentAt: new Date(),
      })),
    })
  }

  return NextResponse.json({ ok: true, id: request.id, daysRequested }, { status: 201 })
}

/**
 * List a staff member's own leave history.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const staff = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const rows = await prisma.leaveRequest.findMany({
    where: { staffId: staff.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      reviewer: { include: { user: { select: { firstName: true, lastName: true } } } },
      substitute: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  })

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      leaveType: r.leaveType,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      daysRequested: r.daysRequested,
      reason: r.reason,
      attachmentUrl: r.attachmentUrl,
      status: r.status,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewerComment: r.reviewerComment,
      reviewerName: r.reviewer
        ? `${r.reviewer.user.firstName} ${r.reviewer.user.lastName}`
        : null,
      substituteName: r.substitute
        ? `${r.substitute.user.firstName} ${r.substitute.user.lastName}`
        : null,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}
