import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]
const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(200),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  type: z.string().max(100),
})

const createSchema = z.object({
  title: z.string().trim().min(2).max(200),
  subjectId: z.string().cuid(),
  sectionIds: z.array(z.string().cuid()).min(1).max(40),
  termId: z.string().cuid().optional(),
  description: z.string().max(500).optional(),
  instructionsMd: z.string().max(8000).optional(),
  dueDate: z.string().datetime(),
  maxScore: z.number().min(1).max(1000).default(100),
  allowLate: z.boolean().default(false),
  attachments: z.array(attachmentSchema).max(10).optional(),
})

const listQuerySchema = z.object({
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  subjectId: z.string().optional(),
  status: z.enum(["active", "past", "all"]).default("all"),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

/**
 * GET /api/assignments — list assignments.
 *
 * Scope by role:
 *   - TEACHER → own assignments by default (can be overridden by admin via UI later)
 *   - STUDENT → assignments whose sectionIds include their current enrolled section
 *   - ADMIN  → all assignments in school
 *
 * Includes per-row counts: submissionCount, expectedCount (active students in sectionIds).
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const url = new URL(req.url)
  const parsed = listQuerySchema.safeParse({
    classId: url.searchParams.get("classId") ?? undefined,
    sectionId: url.searchParams.get("sectionId") ?? undefined,
    subjectId: url.searchParams.get("subjectId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 422 })
  const { classId, sectionId, subjectId, status, q, limit } = parsed.data

  const schoolId = session.user.schoolId
  const role = session.user.role
  const now = new Date()

  const where: Prisma.AssignmentWhereInput = {
    schoolId,
    deletedAt: null,
  }
  if (subjectId) where.subjectId = subjectId
  if (q) where.title = { contains: q, mode: "insensitive" }
  if (status === "active") where.dueDate = { gte: now }
  if (status === "past") where.dueDate = { lt: now }

  // Role scoping
  let studentSectionId: string | null = null
  if (role === "TEACHER") {
    const staff = await prisma.staff.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!staff) return NextResponse.json({ items: [] })
    where.teacherId = staff.id
  } else if (role === "STUDENT") {
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
    studentSectionId = student?.enrollments[0]?.sectionId ?? null
    if (!studentSectionId) return NextResponse.json({ items: [] })
    where.sectionIds = { has: studentSectionId }
  } else if (role === "PARENT") {
    // Parents see all assignments across their kids' sections.
    const parent = await prisma.parent.findUnique({
      where: { userId: session.user.id },
      select: {
        students: {
          select: {
            student: {
              select: {
                enrollments: {
                  where: { isActive: true, deletedAt: null },
                  select: { sectionId: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    })
    const sections =
      parent?.students.flatMap((s) => s.student.enrollments.map((e) => e.sectionId)) ?? []
    if (sections.length === 0) return NextResponse.json({ items: [] })
    where.sectionIds = { hasSome: sections }
  } else if (!ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // sectionId/classId narrow further if the caller specified.
  if (sectionId) {
    where.sectionIds = { has: sectionId }
  } else if (classId) {
    const klassSections = await prisma.section.findMany({
      where: { classId, schoolId, deletedAt: null },
      select: { id: true },
    })
    const ids = klassSections.map((s) => s.id)
    if (ids.length === 0) return NextResponse.json({ items: [] })
    where.sectionIds = { hasSome: ids }
  }

  const rows = await prisma.assignment.findMany({
    where,
    orderBy: [{ dueDate: "desc" }],
    take: limit,
    include: {
      subject: { select: { id: true, name: true, code: true } },
      teacher: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      _count: { select: { submissions: { where: { deletedAt: null } } } },
    },
  })

  // Resolve expected student counts and section labels in bulk.
  const allSectionIds = Array.from(new Set(rows.flatMap((r) => r.sectionIds)))
  const sections = allSectionIds.length
    ? await prisma.section.findMany({
        where: { id: { in: allSectionIds }, schoolId, deletedAt: null },
        select: {
          id: true,
          name: true,
          class: { select: { id: true, name: true } },
          _count: {
            select: {
              enrollments: { where: { isActive: true, deletedAt: null } },
            },
          },
        },
      })
    : []
  const sectionById = new Map(sections.map((s) => [s.id, s]))

  // For student callers, also include "mySubmissionStatus" so the dashboard can
  // show Submitted/Pending without an extra round-trip.
  let mySubsByAssignment = new Map<string, { id: string; submittedAt: Date; score: number | null; gradedAt: Date | null }>()
  if (role === "STUDENT" && rows.length > 0) {
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (student) {
      const subs = await prisma.assignmentSubmission.findMany({
        where: {
          studentId: student.id,
          assignmentId: { in: rows.map((r) => r.id) },
          deletedAt: null,
        },
        select: { id: true, assignmentId: true, submittedAt: true, score: true, gradedAt: true },
      })
      mySubsByAssignment = new Map(
        subs.map((s) => [s.assignmentId, { id: s.id, submittedAt: s.submittedAt, score: s.score, gradedAt: s.gradedAt }]),
      )
    }
  }

  return NextResponse.json({
    items: rows.map((r) => {
      const sectionMeta = r.sectionIds
        .map((id) => sectionById.get(id))
        .filter(Boolean) as NonNullable<ReturnType<typeof sectionById.get>>[]
      const expected = sectionMeta.reduce((sum, s) => sum + s._count.enrollments, 0)
      const isActive = r.dueDate.getTime() >= now.getTime()
      const mine = mySubsByAssignment.get(r.id)
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        instructionsMd: r.instructionsMd,
        dueDate: r.dueDate.toISOString(),
        maxScore: r.maxScore,
        allowLate: r.allowLate,
        attachments: r.attachments ?? null,
        sectionIds: r.sectionIds,
        sections: sectionMeta.map((s) => ({
          id: s.id,
          name: s.name,
          className: s.class.name,
        })),
        subject: r.subject,
        teacher: {
          id: r.teacher.id,
          firstName: r.teacher.user.firstName,
          lastName: r.teacher.user.lastName,
        },
        submissionCount: r._count.submissions,
        expectedCount: expected,
        status: isActive ? "ACTIVE" : "PAST",
        mine: mine
          ? {
              id: mine.id,
              submittedAt: mine.submittedAt.toISOString(),
              score: mine.score,
              graded: !!mine.gradedAt,
            }
          : null,
      }
    }),
  })
}

/**
 * POST /api/assignments — create. Teachers create their own; admins can use
 * any teacher (but here we always set teacherId to the current staff for
 * teachers, or require admins to pass it later — for now admins can't post).
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data
  const schoolId = session.user.schoolId

  const staff = await prisma.staff.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!staff) {
    return NextResponse.json({ error: "Only staff can create assignments" }, { status: 403 })
  }

  // Validate FKs belong to this school.
  const [subject, sectionRows, term] = await Promise.all([
    prisma.subject.findFirst({
      where: { id: data.subjectId, schoolId, deletedAt: null },
      select: { id: true },
    }),
    prisma.section.findMany({
      where: { id: { in: data.sectionIds }, schoolId, deletedAt: null },
      select: { id: true },
    }),
    data.termId
      ? prisma.term.findFirst({
          where: {
            id: data.termId,
            academicYear: { schoolId },
            deletedAt: null,
          },
          select: { id: true },
        })
      : prisma.term.findFirst({
          where: {
            isCurrent: true,
            academicYear: { schoolId, isCurrent: true, deletedAt: null },
            deletedAt: null,
          },
          select: { id: true },
        }),
  ])
  if (!subject) return NextResponse.json({ error: "Invalid subject" }, { status: 422 })
  if (sectionRows.length !== data.sectionIds.length) {
    return NextResponse.json({ error: "One or more sections invalid" }, { status: 422 })
  }
  if (!term) {
    return NextResponse.json(
      { error: "No active term — set a current term first." },
      { status: 422 },
    )
  }

  const created = await prisma.assignment.create({
    data: {
      schoolId,
      subjectId: data.subjectId,
      teacherId: staff.id,
      termId: term.id,
      title: data.title,
      description: data.description ?? null,
      instructionsMd: data.instructionsMd ?? null,
      dueDate: new Date(data.dueDate),
      maxScore: data.maxScore,
      allowLate: data.allowLate,
      attachments: (data.attachments ?? null) as Prisma.InputJsonValue | undefined,
      sectionIds: data.sectionIds,
      fileUrl: data.attachments?.[0]?.url ?? null, // legacy single-file compat
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
