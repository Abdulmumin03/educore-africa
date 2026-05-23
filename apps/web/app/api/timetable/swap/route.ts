import { NextResponse } from "next/server"
import { z } from "zod"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const bodySchema = z.object({
  idA: z.string().cuid(),
  idB: z.string().cuid(),
})

/**
 * POST /api/timetable/swap — swap subject/teacher/room between two slots.
 * Day/time/section stays put; only the assignment moves. Admin only.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 })
  }
  const { idA, idB } = parsed.data
  if (idA === idB) {
    return NextResponse.json({ error: "Same slot" }, { status: 422 })
  }

  const [a, b] = await Promise.all([
    prisma.timetable.findFirst({
      where: { id: idA, schoolId: session.user.schoolId, deletedAt: null },
    }),
    prisma.timetable.findFirst({
      where: { id: idB, schoolId: session.user.schoolId, deletedAt: null },
    }),
  ])
  if (!a || !b) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.$transaction([
    prisma.timetable.update({
      where: { id: a.id },
      data: { subjectId: b.subjectId, teacherId: b.teacherId, room: b.room },
    }),
    prisma.timetable.update({
      where: { id: b.id },
      data: { subjectId: a.subjectId, teacherId: a.teacherId, room: a.room },
    }),
  ])

  return NextResponse.json({ ok: true })
}
