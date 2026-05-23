import { NextResponse } from "next/server"
import { z } from "zod"
import type { Prisma, ResourceKind, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { youtubeId } from "@/lib/youtube"

export const runtime = "nodejs"

const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

const listQuerySchema = z.object({
  subjectId: z.string().cuid().optional(),
  classLevel: z.coerce.number().int().min(1).max(13).optional(),
  kind: z.enum(["PDF", "VIDEO", "IMAGE", "AUDIO"]).optional(),
  q: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60),
})

const createSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().max(2000).optional(),
  kind: z.enum(["PDF", "VIDEO", "IMAGE", "AUDIO"]),
  url: z.string().url(),
  mimeType: z.string().max(100).optional(),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024).optional(),
  subjectId: z.string().cuid().nullable().optional(),
  classLevel: z.number().int().min(1).max(13).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
})

/**
 * GET /api/resources
 *
 * Visibility:
 *   - STUDENT  → only resources tagged for their enrolled class's level or
 *                their enrolled subjects (or unscoped resources).
 *   - PARENT   → same as their children's section's class level (union).
 *   - Others   → see everything in the school.
 *
 * Filters: ?subjectId=&classLevel=&kind=&q=
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })

  const url = new URL(req.url)
  const parsed = listQuerySchema.safeParse({
    subjectId: url.searchParams.get("subjectId") ?? undefined,
    classLevel: url.searchParams.get("classLevel") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 422 })
  const { subjectId, classLevel, kind, q, limit } = parsed.data

  const schoolId = session.user.schoolId
  const role = session.user.role

  const where: Prisma.ResourceWhereInput = {
    schoolId,
    deletedAt: null,
  }
  if (subjectId) where.subjectId = subjectId
  if (classLevel) where.OR = [{ classLevel }, { classLevel: null }]
  if (kind) where.kind = kind
  if (q) where.title = { contains: q, mode: "insensitive" }

  // Role visibility filter.
  if (role === "STUDENT") {
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: {
        enrollments: {
          where: { isActive: true, deletedAt: null },
          select: { class: { select: { level: true } } },
          take: 1,
        },
      },
    })
    const level = student?.enrollments[0]?.class.level ?? null
    if (level !== null) {
      where.AND = [
        { OR: [{ classLevel: level }, { classLevel: null }] },
      ]
    }
  } else if (role === "PARENT") {
    const parent = await prisma.parent.findUnique({
      where: { userId: session.user.id },
      select: {
        students: {
          select: {
            student: {
              select: {
                enrollments: {
                  where: { isActive: true, deletedAt: null },
                  select: { class: { select: { level: true } } },
                  take: 1,
                },
              },
            },
          },
        },
      },
    })
    const levels = Array.from(
      new Set(
        parent?.students.flatMap((s) =>
          s.student.enrollments.map((e) => e.class.level),
        ) ?? [],
      ),
    )
    if (levels.length > 0) {
      where.AND = [
        { OR: [{ classLevel: { in: levels } }, { classLevel: null }] },
      ]
    }
  }

  const rows = await prisma.resource.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      subject: { select: { id: true, name: true, code: true } },
      uploader: { select: { firstName: true, lastName: true } },
    },
  })

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      kind: r.kind,
      url: r.url,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      subject: r.subject,
      classLevel: r.classLevel,
      tags: r.tags,
      downloadCount: r.downloadCount,
      uploader: r.uploader,
      youtubeId: r.kind === "VIDEO" ? youtubeId(r.url) : null,
      createdAt: r.createdAt.toISOString(),
    })),
  })
}

/** POST /api/resources — staff or admin. */
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

  // Videos must be a YouTube URL we can embed; everything else must be on our S3.
  if (data.kind === "VIDEO") {
    if (!youtubeId(data.url)) {
      return NextResponse.json(
        { error: "Video URL must be a YouTube link." },
        { status: 422 },
      )
    }
  }

  if (data.subjectId) {
    const subj = await prisma.subject.findFirst({
      where: { id: data.subjectId, schoolId: session.user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!subj) return NextResponse.json({ error: "Invalid subject" }, { status: 422 })
  }

  const created = await prisma.resource.create({
    data: {
      schoolId: session.user.schoolId,
      uploaderId: session.user.id,
      title: data.title,
      description: data.description ?? null,
      kind: data.kind as ResourceKind,
      url: data.url,
      mimeType: data.mimeType ?? null,
      sizeBytes: data.sizeBytes ?? null,
      subjectId: data.subjectId ?? null,
      classLevel: data.classLevel ?? null,
      tags: data.tags,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}
