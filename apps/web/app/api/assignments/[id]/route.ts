import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma, type UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(200),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  type: z.string().max(100),
})

const patchSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  subjectId: z.string().cuid().optional(),
  sectionIds: z.array(z.string().cuid()).min(1).max(40).optional(),
  description: z.string().max(500).nullable().optional(),
  instructionsMd: z.string().max(8000).nullable().optional(),
  dueDate: z.string().datetime().optional(),
  maxScore: z.number().min(1).max(1000).optional(),
  allowLate: z.boolean().optional(),
  attachments: z.array(attachmentSchema).max(10).nullable().optional(),
})

async function loadAssignment(id: string, schoolId: string) {
  return prisma.assignment.findFirst({
    where: { id, schoolId, deletedAt: null },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      teacher: {
        select: {
          id: true,
          userId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      _count: { select: { submissions: { where: { deletedAt: null } } } },
    },
  })
}

/** GET /api/assignments/[id] — single assignment. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const a = await loadAssignment(params.id, session.user.schoolId)
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Students can only see assignments targeting their enrolled section.
  if (session.user.role === "STUDENT") {
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: {
        enrollments: {
          where: { isActive: true, deletedAt: null },
          select: { sectionId: true },
          take: 1,
        },
      },
    })
    const mySection = student?.enrollments[0]?.sectionId
    if (!mySection || !a.sectionIds.includes(mySection)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
  }

  const sections = a.sectionIds.length
    ? await prisma.section.findMany({
        where: { id: { in: a.sectionIds }, schoolId: session.user.schoolId, deletedAt: null },
        select: {
          id: true,
          name: true,
          class: { select: { id: true, name: true } },
          _count: { select: { enrollments: { where: { isActive: true, deletedAt: null } } } },
        },
      })
    : []
  const expected = sections.reduce((s, sec) => s + sec._count.enrollments, 0)

  return NextResponse.json({
    id: a.id,
    title: a.title,
    description: a.description,
    instructionsMd: a.instructionsMd,
    dueDate: a.dueDate.toISOString(),
    maxScore: a.maxScore,
    allowLate: a.allowLate,
    attachments: a.attachments ?? null,
    sectionIds: a.sectionIds,
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      className: s.class.name,
    })),
    subject: a.subject,
    teacher: {
      id: a.teacher.id,
      userId: a.teacher.userId,
      firstName: a.teacher.user.firstName,
      lastName: a.teacher.user.lastName,
    },
    submissionCount: a._count.submissions,
    expectedCount: expected,
    status: a.dueDate.getTime() >= Date.now() ? "ACTIVE" : "PAST",
  })
}

/** PATCH /api/assignments/[id] — owner or admin. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const a = await loadAssignment(params.id, session.user.schoolId)
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAdmin = ADMIN_ROLES.includes(session.user.role)
  const isOwner = a.teacher.userId === session.user.id
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
  if (data.sectionIds) {
    const sec = await prisma.section.findMany({
      where: { id: { in: data.sectionIds }, schoolId: session.user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (sec.length !== data.sectionIds.length) {
      return NextResponse.json({ error: "One or more sections invalid" }, { status: 422 })
    }
  }

  const patch: Prisma.AssignmentUpdateInput = {}
  if (data.title !== undefined) patch.title = data.title
  if (data.subjectId !== undefined) {
    patch.subject = { connect: { id: data.subjectId } }
  }
  if (data.sectionIds !== undefined) patch.sectionIds = data.sectionIds
  if (data.description !== undefined) patch.description = data.description
  if (data.instructionsMd !== undefined) patch.instructionsMd = data.instructionsMd
  if (data.dueDate !== undefined) patch.dueDate = new Date(data.dueDate)
  if (data.maxScore !== undefined) patch.maxScore = data.maxScore
  if (data.allowLate !== undefined) patch.allowLate = data.allowLate
  if (data.attachments !== undefined) {
    patch.attachments = (data.attachments ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull
    patch.fileUrl = data.attachments?.[0]?.url ?? null
  }

  await prisma.assignment.update({ where: { id: a.id }, data: patch })
  return NextResponse.json({ ok: true })
}

/** DELETE /api/assignments/[id] — owner or admin. Soft delete. */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const a = await loadAssignment(params.id, session.user.schoolId)
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAdmin = ADMIN_ROLES.includes(session.user.role)
  const isOwner = a.teacher.userId === session.user.id
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.assignment.update({
    where: { id: a.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
