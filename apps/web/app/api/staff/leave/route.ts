import { NextResponse } from "next/server"
import type { LeaveStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveStaffAccess, canApproveLeave } from "@/lib/staff-access"

export const runtime = "nodejs"

/**
 * Admin queue for leave requests. Approvers (admin/principal) see all; other
 * staff see only their own.
 */
export async function GET(req: Request) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const status = url.searchParams.get("status") as LeaveStatus | null
  const where: Prisma.LeaveRequestWhereInput = {
    schoolId: access.session.schoolId,
    deletedAt: null,
    ...(status ? { status } : {}),
  }

  if (!canApproveLeave(access.session.role)) {
    if (!access.ownStaffId) {
      return NextResponse.json({ items: [] })
    }
    where.staffId = access.ownStaffId
  }

  const rows = await prisma.leaveRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      staff: {
        select: {
          id: true,
          staffNumber: true,
          department: true,
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
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
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewerComment: r.reviewerComment,
      reviewerName: r.reviewer
        ? `${r.reviewer.user.firstName} ${r.reviewer.user.lastName}`
        : null,
      substituteName: r.substitute
        ? `${r.substitute.user.firstName} ${r.substitute.user.lastName}`
        : null,
      staff: {
        id: r.staff.id,
        staffNumber: r.staff.staffNumber,
        department: r.staff.department,
        firstName: r.staff.user.firstName,
        lastName: r.staff.user.lastName,
        avatarUrl: r.staff.user.avatarUrl,
      },
    })),
  })
}
