import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { resolveStaffAccess, canApproveLeave } from "@/lib/staff-access"
import { reviewLeaveSchema } from "@/lib/staff-schemas"

export const runtime = "nodejs"

export async function PATCH(req: Request, { params }: { params: { leaveId: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const existing = await prisma.leaveRequest.findFirst({
    where: { id: params.leaveId, schoolId: access.session.schoolId, deletedAt: null },
    include: {
      staff: { select: { id: true, userId: true, user: { select: { firstName: true, lastName: true } } } },
    },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = reviewLeaveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 422 })
  }
  const { action, reviewerComment, substituteStaffId } = parsed.data

  const isApproverAction = action === "APPROVE" || action === "REJECT"
  const isOwnCancel = action === "CANCEL" && existing.staff.userId === access.session.userId

  if (isApproverAction && !canApproveLeave(access.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!isApproverAction && !isOwnCancel) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (existing.status !== "PENDING" && action !== "CANCEL") {
    return NextResponse.json({ error: "Leave already reviewed" }, { status: 409 })
  }

  const reviewerStaff = await prisma.staff.findUnique({
    where: { userId: access.session.userId },
    select: { id: true },
  })

  let substitute: string | null = null
  if (action === "APPROVE" && substituteStaffId) {
    const sub = await prisma.staff.findFirst({
      where: { id: substituteStaffId, schoolId: access.session.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!sub) return NextResponse.json({ error: "Invalid substitute" }, { status: 422 })
    substitute = sub.id
  }

  const nextStatus =
    action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CANCELLED"

  const updated = await prisma.leaveRequest.update({
    where: { id: existing.id },
    data: {
      status: nextStatus,
      reviewedById: isApproverAction ? reviewerStaff?.id ?? null : existing.reviewedById,
      reviewedAt: isApproverAction ? new Date() : existing.reviewedAt,
      reviewerComment: reviewerComment || existing.reviewerComment,
      substituteStaffId: substitute,
    },
  })

  // If approved and the leave is currently active, flip the staff status.
  const now = new Date()
  if (
    nextStatus === "APPROVED" &&
    updated.startDate.getTime() <= now.getTime() &&
    updated.endDate.getTime() >= now.getTime()
  ) {
    await prisma.staff.update({
      where: { id: existing.staffId },
      data: { status: "ON_LEAVE" },
    })
  }

  // Notify the requesting staff member.
  if (isApproverAction) {
    await prisma.notification.create({
      data: {
        schoolId: access.session.schoolId,
        userId: existing.staff.userId,
        channel: "IN_APP",
        title: `Leave request ${nextStatus.toLowerCase()}`,
        body:
          nextStatus === "APPROVED"
            ? `Your ${existing.leaveType.toLowerCase()} leave (${existing.daysRequested} days) was approved${reviewerComment ? ": " + reviewerComment : "."}`
            : `Your leave request was rejected${reviewerComment ? ": " + reviewerComment : "."}`,
        metadata: { leaveRequestId: existing.id },
        sentAt: new Date(),
      },
    })

    // Notify the substitute teacher if assigned.
    if (substitute) {
      const subUser = await prisma.staff.findUnique({
        where: { id: substitute },
        select: { userId: true },
      })
      if (subUser) {
        await prisma.notification.create({
          data: {
            schoolId: access.session.schoolId,
            userId: subUser.userId,
            channel: "IN_APP",
            title: "You've been assigned as a substitute",
            body: `Covering for ${existing.staff.user.firstName} ${existing.staff.user.lastName} from ${existing.startDate.toDateString()} to ${existing.endDate.toDateString()}.`,
            metadata: { leaveRequestId: existing.id },
            sentAt: new Date(),
          },
        })
      }
    }
  }

  return NextResponse.json({ ok: true, status: nextStatus })
}
