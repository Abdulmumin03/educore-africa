import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_WRITE_ROLES } from "@/lib/hostel-helpers"

export const runtime = "nodejs"

const STAFF_VIEW_ROLES: UserRole[] = HOSTEL_WRITE_ROLES

const createSchema = z.object({
  studentId: z.string().cuid(),
  departureDate: z.string().datetime(),
  returnDate: z.string().datetime(),
  destination: z.string().trim().min(2).max(160),
  reason: z.string().trim().min(2).max(500),
})

/** GET /api/hostel/exeat — list. Role-aware: students/parents see their own. */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const url = new URL(req.url)
  const status = url.searchParams.get("status")

  const where: Prisma.ExeatWhereInput = {
    schoolId: session.user.schoolId,
    deletedAt: null,
  }
  if (status && /^(PENDING|APPROVED|REJECTED|PICKED_UP|RETURNED)$/.test(status)) {
    where.status = status as Prisma.ExeatWhereInput["status"]
  }

  if (session.user.role === "STUDENT") {
    const me = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!me) return NextResponse.json({ items: [] })
    where.studentId = me.id
  } else if (session.user.role === "PARENT") {
    const links = await prisma.studentParent.findMany({
      where: { parent: { userId: session.user.id } },
      select: { studentId: true },
    })
    where.studentId = { in: links.map((l) => l.studentId) }
  } else if (!STAFF_VIEW_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const rows = await prisma.exeat.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      student: {
        select: {
          id: true,
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      approvedBy: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })

  // Hide the OTP from anyone who isn't the parent (or staff who issued it).
  const isPrivileged = STAFF_VIEW_ROLES.includes(session.user.role)
  const isParent = session.user.role === "PARENT"

  return NextResponse.json({
    items: rows.map((e) => ({
      id: e.id,
      studentId: e.studentId,
      student: {
        firstName: e.student.user.firstName,
        lastName: e.student.user.lastName,
        admissionNumber: e.student.admissionNumber,
      },
      departureDate: e.departureDate.toISOString(),
      returnDate: e.returnDate.toISOString(),
      destination: e.destination,
      reason: e.reason,
      status: e.status,
      approvedBy: e.approvedBy
        ? {
            id: e.approvedBy.id,
            name: `${e.approvedBy.user.firstName} ${e.approvedBy.user.lastName}`,
          }
        : null,
      approvedAt: e.approvedAt?.toISOString() ?? null,
      rejectionReason: e.rejectionReason,
      pickupOtp: isPrivileged || isParent ? e.pickupOtp : null,
      pickupConfirmedAt: e.pickupConfirmedAt?.toISOString() ?? null,
      returnConfirmedAt: e.returnConfirmedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  })
}

/** POST /api/hostel/exeat — student or their parent submits a request. */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  const student = await prisma.student.findFirst({
    where: { id: data.studentId, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true, userId: true },
  })
  if (!student) return NextResponse.json({ error: "Invalid student" }, { status: 422 })

  // Submission gate:
  //   STUDENT → self only
  //   PARENT  → must be linked to the student
  //   Staff   → fine on behalf of student
  if (session.user.role === "STUDENT" && student.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (session.user.role === "PARENT") {
    const link = await prisma.studentParent.findFirst({
      where: { studentId: student.id, parent: { userId: session.user.id } },
      select: { studentId: true },
    })
    if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  } else if (
    session.user.role !== "STUDENT" &&
    !HOSTEL_WRITE_ROLES.includes(session.user.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const departure = new Date(data.departureDate)
  const ret = new Date(data.returnDate)
  if (ret <= departure) {
    return NextResponse.json(
      { error: "Return date must be after departure date." },
      { status: 422 },
    )
  }

  const created = await prisma.exeat.create({
    data: {
      schoolId: session.user.schoolId,
      studentId: student.id,
      departureDate: departure,
      returnDate: ret,
      destination: data.destination,
      reason: data.reason,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
