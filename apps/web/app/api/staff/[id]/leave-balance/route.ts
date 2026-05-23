import { NextResponse } from "next/server"
import type { LeaveType } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveStaffAccess } from "@/lib/staff-access"

export const runtime = "nodejs"

// Fallback entitlements if no LeavePolicy is configured for a leave type.
const DEFAULT_DAYS: Record<LeaveType, number> = {
  ANNUAL: 20,
  SICK: 10,
  MATERNITY: 90,
  PATERNITY: 7,
  EMERGENCY: 3,
  STUDY: 5,
  UNPAID: 30,
}

const LEAVE_TYPES = Object.keys(DEFAULT_DAYS) as LeaveType[]

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const staff = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true, hireDate: true },
  })
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Year-to-date window. Annual leave resets each calendar year; for now we
  // treat every type the same and compute usage YTD.
  const ytdStart = new Date(new Date().getFullYear(), 0, 1)

  const [policies, used] = await Promise.all([
    prisma.leavePolicy.findMany({ where: { schoolId: access.session.schoolId } }),
    prisma.leaveRequest.groupBy({
      by: ["leaveType"],
      where: {
        staffId: staff.id,
        status: "APPROVED",
        deletedAt: null,
        startDate: { gte: ytdStart },
      },
      _sum: { daysRequested: true },
    }),
  ])

  const policyByType = new Map(policies.map((p) => [p.leaveType, p]))
  const usedByType = new Map(used.map((u) => [u.leaveType, u._sum.daysRequested ?? 0]))

  return NextResponse.json({
    balances: LEAVE_TYPES.map((leaveType) => {
      const policy = policyByType.get(leaveType)
      const entitled = policy?.defaultDays ?? DEFAULT_DAYS[leaveType]
      const usedDays = usedByType.get(leaveType) ?? 0
      return {
        leaveType,
        entitled,
        used: usedDays,
        remaining: Math.max(0, entitled - usedDays),
        paid: policy?.paid ?? leaveType !== "UNPAID",
      }
    }),
  })
}
