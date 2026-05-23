import { NextResponse } from "next/server"
import { z } from "zod"
import type { NotificationChannel, Prisma, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { dispatchAnnouncement } from "@/lib/announcement-dispatch"
import { renderMarkdown } from "@/lib/markdown"

export const runtime = "nodejs"

const STAFF_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "LIBRARIAN",
  "HOSTEL_MASTER",
  "DRIVER",
]
const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

/**
 * Build the audience filter for the current user. Announcements visible to a user are:
 *   - audience = ALL
 *   - audience matches their role bucket (STUDENTS / PARENTS / STAFF)
 *   - audience = CLASS for a class the user is enrolled in (student) or has a child in (parent)
 *   - audience = SECTION ditto
 */
async function audienceFilter(
  userId: string,
  role: UserRole,
): Promise<Prisma.AnnouncementWhereInput> {
  const orClauses: Prisma.AnnouncementWhereInput[] = [{ audience: "ALL" }]

  if (role === "STUDENT") {
    orClauses.push({ audience: "STUDENTS" })
    const student = await prisma.student.findUnique({
      where: { userId },
      select: {
        enrollments: {
          where: { isActive: true, deletedAt: null },
          select: { classId: true, sectionId: true },
        },
      },
    })
    const classIds = student?.enrollments.map((e) => e.classId) ?? []
    const sectionIds = student?.enrollments.map((e) => e.sectionId) ?? []
    if (classIds.length) orClauses.push({ audience: "CLASS", classId: { in: classIds } })
    if (sectionIds.length) orClauses.push({ audience: "SECTION", sectionId: { in: sectionIds } })
  } else if (role === "PARENT") {
    orClauses.push({ audience: "PARENTS" })
    const parent = await prisma.parent.findUnique({
      where: { userId },
      select: {
        students: {
          select: {
            student: {
              select: {
                enrollments: {
                  where: { isActive: true, deletedAt: null },
                  select: { classId: true, sectionId: true },
                },
              },
            },
          },
        },
      },
    })
    const classIds = parent?.students.flatMap((s) => s.student.enrollments.map((e) => e.classId)) ?? []
    const sectionIds =
      parent?.students.flatMap((s) => s.student.enrollments.map((e) => e.sectionId)) ?? []
    if (classIds.length) orClauses.push({ audience: "CLASS", classId: { in: classIds } })
    if (sectionIds.length) orClauses.push({ audience: "SECTION", sectionId: { in: sectionIds } })
  } else if (STAFF_ROLES.includes(role)) {
    orClauses.push({ audience: "STAFF" })
  }

  return { OR: orClauses }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId) {
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  }

  const url = new URL(req.url)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 10)))

  const now = new Date()
  const audience = await audienceFilter(session.user.id, session.user.role)

  const items = await prisma.announcement.findMany({
    where: {
      schoolId: session.user.schoolId,
      deletedAt: null,
      AND: [
        { OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        audience,
      ],
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      author: { select: { firstName: true, lastName: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
      reads: {
        where: { userId: session.user.id },
        select: { readAt: true },
        take: 1,
      },
    },
  })

  return NextResponse.json({
    items: items.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      bodyHtml: renderMarkdown(a.body),
      audience: a.audience,
      priority: a.priority,
      channels: a.channels,
      attachments: a.attachments ?? null,
      publishedAt: (a.publishedAt ?? a.createdAt).toISOString(),
      expiresAt: a.expiresAt?.toISOString() ?? null,
      author: a.author ? `${a.author.firstName} ${a.author.lastName}` : null,
      scope:
        a.audience === "CLASS" && a.class
          ? a.class.name
          : a.audience === "SECTION" && a.section
            ? `Arm ${a.section.name}`
            : null,
      readAt: a.reads[0]?.readAt.toISOString() ?? null,
    })),
  })
}

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(200),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  type: z.string().max(100),
})

const createSchema = z
  .object({
    title: z.string().trim().min(2).max(140),
    body: z.string().trim().min(2).max(4000),
    audience: z.enum(["ALL", "STUDENTS", "PARENTS", "STAFF", "CLASS", "SECTION"]).default("ALL"),
    priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).default("NORMAL"),
    channels: z
      .array(z.enum(["IN_APP", "EMAIL", "SMS", "WHATSAPP", "PUSH"]))
      .max(5)
      .optional(),
    attachments: z.array(attachmentSchema).max(10).optional(),
    classId: z.string().optional(),
    sectionId: z.string().optional(),
    publishedAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .refine((v) => v.audience !== "CLASS" || !!v.classId, {
    message: "classId is required when audience = CLASS",
    path: ["classId"],
  })
  .refine((v) => v.audience !== "SECTION" || !!v.sectionId, {
    message: "sectionId is required when audience = SECTION",
    path: ["sectionId"],
  })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId) {
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  }
  if (!WRITE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const {
    title,
    body,
    audience,
    priority,
    channels,
    attachments,
    classId,
    sectionId,
    publishedAt,
    expiresAt,
  } = parsed.data

  // Verify scoped IDs belong to this school.
  if (classId) {
    const klass = await prisma.class.findFirst({
      where: { id: classId, schoolId: session.user.schoolId },
      select: { id: true },
    })
    if (!klass) return NextResponse.json({ error: "Invalid class" }, { status: 422 })
  }
  if (sectionId) {
    const sec = await prisma.section.findFirst({
      where: { id: sectionId, schoolId: session.user.schoolId },
      select: { id: true },
    })
    if (!sec) return NextResponse.json({ error: "Invalid arm" }, { status: 422 })
  }

  const created = await prisma.announcement.create({
    data: {
      schoolId: session.user.schoolId,
      authorId: session.user.id,
      title,
      body,
      audience,
      priority,
      channels: (channels ?? []) as NotificationChannel[],
      attachments: attachments as Prisma.InputJsonValue | undefined,
      classId: audience === "CLASS" ? classId! : null,
      sectionId: audience === "SECTION" ? sectionId! : null,
      publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  })

  // Only dispatch if the announcement is already live (not future-scheduled).
  const isLive =
    !created.publishedAt || created.publishedAt.getTime() <= Date.now()
  const dispatch = isLive
    ? await dispatchAnnouncement(created)
    : { recipients: 0, inApp: 0, email: 0, sms: 0, whatsapp: 0, push: 0, capped: false }

  if (isLive) {
    await prisma.announcement.update({
      where: { id: created.id },
      data: { dispatchedAt: new Date() },
    })
  }

  return NextResponse.json(
    { ok: true, id: created.id, dispatch, scheduled: !isLive },
    { status: 201 },
  )
}
