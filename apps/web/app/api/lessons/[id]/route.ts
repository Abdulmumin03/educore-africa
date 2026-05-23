import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma, UserRole, LessonMethodology } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]
// Lesson plans are teacher workings — never exposed to students or parents.
const READ_ROLES: UserRole[] = [...ADMIN_ROLES, "TEACHER"]

const patchSchema = z.object({
  subjectId: z.string().cuid().optional(),
  classId: z.string().cuid().optional(),
  sectionId: z.string().cuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  durationMin: z.number().int().min(20).max(180).optional(),
  topic: z.string().trim().min(2).max(200).optional(),
  subtopic: z.string().max(200).nullable().optional(),
  objectives: z.array(z.string().min(2).max(200)).min(1).max(8).optional(),
  methodology: z.enum(["LECTURE", "DISCUSSION", "PRACTICAL", "MIXED"]).optional(),
  materials: z.array(z.string().min(1).max(120)).max(15).optional(),
  contentMd: z.string().min(2).max(20000).optional(),
  assessment: z.string().max(1000).nullable().optional(),
  homework: z.string().max(1000).nullable().optional(),
  isShared: z.boolean().optional(),
})

async function loadLesson(id: string, schoolId: string) {
  return prisma.lessonPlan.findFirst({
    where: { id, schoolId, deletedAt: null },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      author: {
        select: {
          id: true,
          userId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!READ_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const lp = await loadLesson(params.id, session.user.schoolId)
  if (!lp) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAdmin = ADMIN_ROLES.includes(session.user.role)
  const isOwner = lp.author.userId === session.user.id
  if (!isAdmin && !isOwner && !lp.isShared) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({
    id: lp.id,
    date: lp.date.toISOString().slice(0, 10),
    durationMin: lp.durationMin,
    topic: lp.topic,
    subtopic: lp.subtopic,
    objectives: lp.objectives,
    methodology: lp.methodology,
    materials: lp.materials,
    contentMd: lp.contentMd,
    assessment: lp.assessment,
    homework: lp.homework,
    isShared: lp.isShared,
    parentId: lp.parentId,
    subject: lp.subject,
    class: lp.class,
    section: lp.section,
    author: {
      id: lp.author.id,
      firstName: lp.author.user.firstName,
      lastName: lp.author.user.lastName,
    },
    isMine: isOwner,
    canEdit: isOwner || isAdmin,
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const lp = await loadLesson(params.id, session.user.schoolId)
  if (!lp) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAdmin = ADMIN_ROLES.includes(session.user.role)
  const isOwner = lp.author.userId === session.user.id
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  if (data.subjectId) {
    const subj = await prisma.subject.findFirst({
      where: { id: data.subjectId, schoolId: session.user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!subj) return NextResponse.json({ error: "Invalid subject" }, { status: 422 })
  }
  if (data.classId) {
    const klass = await prisma.class.findFirst({
      where: { id: data.classId, schoolId: session.user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!klass) return NextResponse.json({ error: "Invalid class" }, { status: 422 })
  }
  if (data.sectionId) {
    const sec = await prisma.section.findFirst({
      where: { id: data.sectionId, schoolId: session.user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!sec) return NextResponse.json({ error: "Invalid arm" }, { status: 422 })
  }

  const patch: Prisma.LessonPlanUpdateInput = {}
  if (data.subjectId) patch.subject = { connect: { id: data.subjectId } }
  if (data.classId) patch.class = { connect: { id: data.classId } }
  if (data.sectionId !== undefined) {
    patch.section = data.sectionId
      ? { connect: { id: data.sectionId } }
      : { disconnect: true }
  }
  if (data.date) patch.date = new Date(data.date)
  if (data.durationMin !== undefined) patch.durationMin = data.durationMin
  if (data.topic !== undefined) patch.topic = data.topic
  if (data.subtopic !== undefined) patch.subtopic = data.subtopic
  if (data.objectives !== undefined) patch.objectives = data.objectives
  if (data.methodology !== undefined) patch.methodology = data.methodology as LessonMethodology
  if (data.materials !== undefined) patch.materials = data.materials
  if (data.contentMd !== undefined) patch.contentMd = data.contentMd
  if (data.assessment !== undefined) patch.assessment = data.assessment
  if (data.homework !== undefined) patch.homework = data.homework
  if (data.isShared !== undefined) patch.isShared = data.isShared

  await prisma.lessonPlan.update({ where: { id: lp.id }, data: patch })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const lp = await loadLesson(params.id, session.user.schoolId)
  if (!lp) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAdmin = ADMIN_ROLES.includes(session.user.role)
  const isOwner = lp.author.userId === session.user.id
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  await prisma.lessonPlan.update({
    where: { id: lp.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
