import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

/**
 * POST /api/lessons/[id]/duplicate — copy a lesson plan to the caller's
 * authorship for editing. Sets `parentId` for provenance. Source must be the
 * caller's own plan OR shared.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const src = await prisma.lessonPlan.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    include: { author: { select: { userId: true } } },
  })
  if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isOwner = src.author.userId === session.user.id
  if (!isOwner && !src.isShared) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const staff = await prisma.staff.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!staff) {
    return NextResponse.json({ error: "Only staff can duplicate" }, { status: 403 })
  }

  const copy = await prisma.lessonPlan.create({
    data: {
      schoolId: src.schoolId,
      authorId: staff.id,
      subjectId: src.subjectId,
      classId: src.classId,
      sectionId: src.sectionId,
      date: new Date(), // start with today; teacher can change
      durationMin: src.durationMin,
      topic: src.topic,
      subtopic: src.subtopic,
      objectives: src.objectives,
      methodology: src.methodology,
      materials: src.materials,
      contentMd: src.contentMd,
      assessment: src.assessment,
      homework: src.homework,
      isShared: false, // copies start private
      parentId: src.id,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: copy.id }, { status: 201 })
}
