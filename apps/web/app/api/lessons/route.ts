import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma, UserRole, LessonMethodology } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]
// Lesson plans are teacher workings — never exposed to students or parents.
const READ_ROLES: UserRole[] = WRITE_ROLES

const listQuerySchema = z.object({
  staffId: z.string().cuid().optional(),
  subjectId: z.string().cuid().optional(),
  classId: z.string().cuid().optional(),
  q: z.string().max(80).optional(),
  scope: z.enum(["mine", "shared", "all"]).default("mine"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const createSchema = z.object({
  subjectId: z.string().cuid(),
  classId: z.string().cuid(),
  sectionId: z.string().cuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  durationMin: z.number().int().min(20).max(180).default(40),
  topic: z.string().trim().min(2).max(200),
  subtopic: z.string().max(200).nullable().optional(),
  objectives: z.array(z.string().min(2).max(200)).min(1).max(8),
  methodology: z.enum(["LECTURE", "DISCUSSION", "PRACTICAL", "MIXED"]).default("LECTURE"),
  materials: z.array(z.string().min(1).max(120)).max(15).default([]),
  contentMd: z.string().min(2).max(20000),
  assessment: z.string().max(1000).nullable().optional(),
  homework: z.string().max(1000).nullable().optional(),
  isShared: z.boolean().default(false),
})

/**
 * GET /api/lessons — list lesson plans visible to the caller.
 *
 * scope=mine   → only the caller's plans (default for teachers)
 * scope=shared → school-shared plans (isShared=true)
 * scope=all    → both
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!READ_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const parsed = listQuerySchema.safeParse({
    staffId: url.searchParams.get("staffId") ?? undefined,
    subjectId: url.searchParams.get("subjectId") ?? undefined,
    classId: url.searchParams.get("classId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 422 })
  const { staffId, subjectId, classId, q, scope, limit } = parsed.data

  const schoolId = session.user.schoolId
  const myStaff =
    session.user.role === "TEACHER"
      ? await prisma.staff.findUnique({
          where: { userId: session.user.id },
          select: { id: true },
        })
      : null

  const where: Prisma.LessonPlanWhereInput = {
    schoolId,
    deletedAt: null,
  }
  if (subjectId) where.subjectId = subjectId
  if (classId) where.classId = classId
  if (staffId) where.authorId = staffId
  if (q) where.OR = [{ topic: { contains: q, mode: "insensitive" } }, { subtopic: { contains: q, mode: "insensitive" } }]

  // Scope visibility.
  const myStaffId = myStaff?.id
  if (scope === "mine") {
    if (!myStaffId) return NextResponse.json({ items: [] })
    where.authorId = where.authorId ?? myStaffId
  } else if (scope === "shared") {
    where.isShared = true
  } else {
    // "all" — own + shared
    if (myStaffId) {
      where.OR = [...(where.OR ?? []), { authorId: myStaffId }, { isShared: true }]
    } else {
      where.isShared = true
    }
  }

  const rows = await prisma.lessonPlan.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      subject: { select: { id: true, name: true, code: true } },
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      author: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      durationMin: r.durationMin,
      topic: r.topic,
      subtopic: r.subtopic,
      methodology: r.methodology,
      isShared: r.isShared,
      parentId: r.parentId,
      subject: r.subject,
      class: r.class,
      section: r.section,
      author: {
        id: r.author.id,
        firstName: r.author.user.firstName,
        lastName: r.author.user.lastName,
      },
      isMine: !!myStaffId && r.authorId === myStaffId,
    })),
  })
}

/** POST /api/lessons — create. Teacher + admin. */
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
    return NextResponse.json({ error: "Only staff can create lesson plans" }, { status: 403 })
  }

  const [subject, klass, section] = await Promise.all([
    prisma.subject.findFirst({
      where: { id: data.subjectId, schoolId, deletedAt: null },
      select: { id: true },
    }),
    prisma.class.findFirst({
      where: { id: data.classId, schoolId, deletedAt: null },
      select: { id: true },
    }),
    data.sectionId
      ? prisma.section.findFirst({
          where: { id: data.sectionId, classId: data.classId, schoolId, deletedAt: null },
          select: { id: true },
        })
      : Promise.resolve(null),
  ])
  if (!subject) return NextResponse.json({ error: "Invalid subject" }, { status: 422 })
  if (!klass) return NextResponse.json({ error: "Invalid class" }, { status: 422 })
  if (data.sectionId && !section) {
    return NextResponse.json({ error: "Invalid arm" }, { status: 422 })
  }

  const created = await prisma.lessonPlan.create({
    data: {
      schoolId,
      authorId: staff.id,
      subjectId: data.subjectId,
      classId: data.classId,
      sectionId: data.sectionId ?? null,
      date: new Date(data.date),
      durationMin: data.durationMin,
      topic: data.topic,
      subtopic: data.subtopic ?? null,
      objectives: data.objectives,
      methodology: data.methodology as LessonMethodology,
      materials: data.materials,
      contentMd: data.contentMd,
      assessment: data.assessment ?? null,
      homework: data.homework ?? null,
      isShared: data.isShared,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
