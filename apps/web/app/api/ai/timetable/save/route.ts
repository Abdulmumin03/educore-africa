import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"
import { timetableSlotSchema } from "@/lib/ai/timetable"

export const runtime = "nodejs"

const saveSchema = z.object({
  academicYearId: z.string().cuid(),
  slots: z.array(timetableSlotSchema).min(1).max(2000),
  replace: z.boolean().default(true), // soft-delete prior slots for the same sectionIds
})

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = saveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { academicYearId, slots, replace } = parsed.data

  // Validate refs belong to this school + dedupe per the unique constraint.
  const sectionIds = Array.from(new Set(slots.map((s) => s.sectionId)))
  const sections = await prisma.section.findMany({
    where: { id: { in: sectionIds }, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (sections.length !== sectionIds.length) {
    return NextResponse.json({ error: "Some sections don't belong to this school" }, { status: 422 })
  }

  if (replace) {
    await prisma.timetable.updateMany({
      where: {
        schoolId: session.user.schoolId,
        academicYearId,
        sectionId: { in: sectionIds },
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    })
  }

  let saved = 0
  for (const s of slots) {
    try {
      await prisma.timetable.create({
        data: {
          schoolId: session.user.schoolId,
          academicYearId,
          classId: s.classId,
          sectionId: s.sectionId,
          subjectId: s.subjectId,
          teacherId: s.teacherId,
          dayOfWeek: s.day,
          startTime: s.startTime,
          endTime: s.endTime,
          room: s.room ?? null,
        },
      })
      saved += 1
    } catch (err) {
      // Skip duplicates — unique constraint is (sectionId, dayOfWeek, startTime).
      if (!(err instanceof Error && /Unique constraint/i.test(err.message))) {
        console.error("[timetable/save] insert failed", err)
      }
    }
  }

  // After save, surface teacher double-bookings across the affected sections so
  // the AI Timetable UI can warn the user. Algorithm mirrors GET /api/timetable.
  const persisted = await prisma.timetable.findMany({
    where: {
      schoolId: session.user.schoolId,
      academicYearId,
      sectionId: { in: sectionIds },
      deletedAt: null,
    },
    select: {
      id: true,
      teacherId: true,
      sectionId: true,
      classId: true,
      subjectId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
    },
  })
  const teacherIds = Array.from(new Set(persisted.map((p) => p.teacherId)))
  const peers = teacherIds.length
    ? await prisma.timetable.findMany({
        where: {
          schoolId: session.user.schoolId,
          academicYearId,
          teacherId: { in: teacherIds },
          deletedAt: null,
        },
        select: {
          id: true,
          teacherId: true,
          sectionId: true,
          classId: true,
          subjectId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
        },
      })
    : []

  type DoubleBook = {
    type: "teacher-double-booked"
    teacherId: string
    dayOfWeek: number
    startTime: string
    slotIds: string[]
  }
  const groups = new Map<string, typeof peers>()
  for (const p of peers) {
    const key = `${p.teacherId}-${p.dayOfWeek}-${p.startTime}`
    const list = groups.get(key) ?? []
    list.push(p)
    groups.set(key, list)
  }
  const conflicts: DoubleBook[] = []
  groups.forEach((group) => {
    if (group.length < 2) return
    conflicts.push({
      type: "teacher-double-booked",
      teacherId: group[0].teacherId,
      dayOfWeek: group[0].dayOfWeek,
      startTime: group[0].startTime,
      slotIds: group.map((g) => g.id),
    })
  })

  return NextResponse.json({
    ok: true,
    saved,
    replaced: replace,
    conflicts,
    conflictCount: conflicts.length,
  })
}
