import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { HOSTEL_WRITE_ROLES, genderMatches } from "@/lib/hostel-helpers"

export const runtime = "nodejs"

const createSchema = z.object({
  studentId: z.string().cuid(),
  roomId: z.string().cuid(),
  bedNumber: z.number().int().min(1).max(20),
  fromDate: z.string().datetime().optional(),
})

/**
 * POST /api/hostel/assignments — assign a student to a specific bed.
 * Enforces: gender compatibility, bed in range, no double-booking the bed,
 * student doesn't already have an active assignment elsewhere.
 */
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
  const { studentId, roomId, bedNumber } = parsed.data

  const [student, room] = await Promise.all([
    prisma.student.findFirst({
      where: { id: studentId, schoolId: session.user.schoolId, deletedAt: null },
      select: { id: true, gender: true },
    }),
    prisma.hostelRoom.findFirst({
      where: {
        id: roomId,
        deletedAt: null,
        hostel: { schoolId: session.user.schoolId, deletedAt: null },
      },
      select: {
        id: true,
        capacity: true,
        hostel: { select: { gender: true } },
      },
    }),
  ])
  if (!student) return NextResponse.json({ error: "Invalid student" }, { status: 422 })
  if (!room) return NextResponse.json({ error: "Invalid room" }, { status: 422 })

  if (bedNumber > room.capacity) {
    return NextResponse.json(
      { error: `Bed ${bedNumber} doesn't exist — room has ${room.capacity} beds.` },
      { status: 422 },
    )
  }
  if (!genderMatches(student.gender, room.hostel.gender)) {
    return NextResponse.json(
      { error: `Student's gender doesn't match the hostel's gender (${room.hostel.gender}).` },
      { status: 409 },
    )
  }

  // Bed already taken?
  const bedTaken = await prisma.hostelAssignment.findFirst({
    where: { roomId, bedNumber, deletedAt: null, toDate: null },
    select: { id: true },
  })
  if (bedTaken) {
    return NextResponse.json(
      { error: "That bed is already assigned to another student." },
      { status: 409 },
    )
  }

  // Student already has an active hostel assignment elsewhere?
  const studentActive = await prisma.hostelAssignment.findFirst({
    where: { studentId, deletedAt: null, toDate: null },
    select: { id: true },
  })
  if (studentActive) {
    return NextResponse.json(
      {
        error: "Student already has an active assignment. Check them out first.",
      },
      { status: 409 },
    )
  }

  const created = await prisma.hostelAssignment.create({
    data: {
      studentId,
      roomId,
      bedNumber,
      fromDate: new Date(),
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
