import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { resolveStaffAccess } from "@/lib/staff-access"

export const runtime = "nodejs"

const checkInOutSchema = z.object({
  action: z.enum(["CHECK_IN", "CHECK_OUT"]),
  remark: z.string().trim().max(240).optional().or(z.literal("")),
  // Optional override for admins recording on behalf of someone. Default: today.
  date: z.string().optional(),
})

function startOfDayLocal(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Clock-in / clock-out. Self-service for the staff member themselves; admins
 * and principals can clock anyone in (e.g. for back-fill).
 *
 * Idempotent per (staffId, date): the first call upserts a row with checkInAt,
 * subsequent calls update checkOutAt. LATE is auto-flagged if check-in is
 * after 08:30 local time.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const target = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true, userId: true },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isSelf = target.userId === access.session.userId
  const isPrivileged = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(access.session.role)
  if (!isSelf && !isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = checkInOutSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 })

  const { action, remark, date } = parsed.data
  const day = date ? new Date(date) : startOfDayLocal()
  day.setHours(0, 0, 0, 0)
  const now = new Date()

  const currentTerm = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId: access.session.schoolId } },
    select: { id: true },
  })

  // LATE if check-in is after 08:30 local; for check-out we keep prior status.
  let lateStatus: "PRESENT" | "LATE" = "PRESENT"
  if (action === "CHECK_IN") {
    const cutoff = new Date(day)
    cutoff.setHours(8, 30, 0, 0)
    lateStatus = now.getTime() > cutoff.getTime() ? "LATE" : "PRESENT"
  }

  const row = await prisma.staffAttendance.upsert({
    where: { staffId_date: { staffId: target.id, date: day } },
    create: {
      schoolId: access.session.schoolId,
      staffId: target.id,
      date: day,
      status: action === "CHECK_IN" ? lateStatus : "PRESENT",
      checkInAt: action === "CHECK_IN" ? now : null,
      checkOutAt: action === "CHECK_OUT" ? now : null,
      remark: remark || null,
      termId: currentTerm?.id ?? null,
    },
    update:
      action === "CHECK_IN"
        ? { checkInAt: now, status: lateStatus, remark: remark || undefined }
        : { checkOutAt: now, remark: remark || undefined },
  })

  return NextResponse.json({
    ok: true,
    id: row.id,
    action,
    at: now.toISOString(),
    status: row.status,
  })
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const staff = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const term = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId: access.session.schoolId } },
    select: { id: true, startDate: true, endDate: true },
  })

  const where = {
    staffId: staff.id,
    deletedAt: null,
    ...(term?.id ? { termId: term.id } : {}),
  }

  const rows = await prisma.staffAttendance.findMany({
    where,
    orderBy: { date: "desc" },
    take: 120,
  })

  const grouped = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const totalDays = rows.length
  const present = (grouped.PRESENT ?? 0) + (grouped.LATE ?? 0) + (grouped.REMOTE ?? 0)
  const percent = totalDays === 0 ? null : Math.round((present / totalDays) * 100)

  return NextResponse.json({
    summary: {
      PRESENT: grouped.PRESENT ?? 0,
      LATE: grouped.LATE ?? 0,
      ABSENT: grouped.ABSENT ?? 0,
      REMOTE: grouped.REMOTE ?? 0,
      HOLIDAY: grouped.HOLIDAY ?? 0,
      totalDays,
      percent,
    },
    items: rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      status: r.status,
      checkInAt: r.checkInAt?.toISOString() ?? null,
      checkOutAt: r.checkOutAt?.toISOString() ?? null,
      remark: r.remark,
    })),
  })
}
