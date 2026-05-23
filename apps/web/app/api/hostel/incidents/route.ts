import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_WRITE_ROLES } from "@/lib/hostel-helpers"

export const runtime = "nodejs"

const createSchema = z.object({
  hostelId: z.string().cuid(),
  studentId: z.string().cuid().nullable().optional(),
  description: z.string().trim().min(2).max(2000),
  actionTaken: z.string().max(1000).nullable().optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  occurredAt: z.string().datetime().optional(),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!HOSTEL_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const hostelId = url.searchParams.get("hostelId") ?? undefined

  const where: Prisma.HostelIncidentWhereInput = {
    schoolId: session.user.schoolId,
    deletedAt: null,
  }
  if (hostelId) where.hostelId = hostelId

  const rows = await prisma.hostelIncident.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: 100,
    include: {
      hostel: { select: { id: true, name: true } },
      student: {
        select: {
          id: true,
          admissionNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      reporter: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })

  return NextResponse.json({
    items: rows.map((i) => ({
      id: i.id,
      hostel: i.hostel,
      student: i.student
        ? {
            id: i.student.id,
            admissionNumber: i.student.admissionNumber,
            name: `${i.student.user.firstName} ${i.student.user.lastName}`,
          }
        : null,
      reporter: `${i.reporter.user.firstName} ${i.reporter.user.lastName}`,
      description: i.description,
      actionTaken: i.actionTaken,
      severity: i.severity,
      occurredAt: i.occurredAt.toISOString(),
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!HOSTEL_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  const [hostel, staff, student] = await Promise.all([
    prisma.hostel.findFirst({
      where: { id: data.hostelId, schoolId: session.user.schoolId, deletedAt: null },
      select: { id: true },
    }),
    prisma.staff.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    }),
    data.studentId
      ? prisma.student.findFirst({
          where: { id: data.studentId, schoolId: session.user.schoolId, deletedAt: null },
          select: { id: true },
        })
      : Promise.resolve(null),
  ])
  if (!hostel) return NextResponse.json({ error: "Invalid hostel" }, { status: 422 })
  if (!staff)
    return NextResponse.json({ error: "Only staff can log incidents" }, { status: 403 })
  if (data.studentId && !student) {
    return NextResponse.json({ error: "Invalid student" }, { status: 422 })
  }

  const created = await prisma.hostelIncident.create({
    data: {
      schoolId: session.user.schoolId,
      hostelId: data.hostelId,
      studentId: data.studentId ?? null,
      reporterId: staff.id,
      description: data.description,
      actionTaken: data.actionTaken ?? null,
      severity: data.severity,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
