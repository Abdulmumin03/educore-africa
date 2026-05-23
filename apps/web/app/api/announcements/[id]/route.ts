import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import type { NotificationChannel, UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { dispatchAnnouncement } from "@/lib/announcement-dispatch"

export const runtime = "nodejs"

const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]
const PRIVILEGED_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId) {
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  }
  if (!WRITE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await prisma.announcement.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true, authorId: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Teachers can only delete their own; admins/principals can delete any.
  if (!PRIVILEGED_ROLES.includes(session.user.role) && existing.authorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.announcement.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

const patchAttachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(200),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  type: z.string().max(100),
})

const patchSchema = z
  .object({
    title: z.string().trim().min(2).max(140).optional(),
    body: z.string().trim().min(2).max(4000).optional(),
    audience: z.enum(["ALL", "STUDENTS", "PARENTS", "STAFF", "CLASS", "SECTION"]).optional(),
    priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).optional(),
    channels: z
      .array(z.enum(["IN_APP", "EMAIL", "SMS", "WHATSAPP", "PUSH"]))
      .max(5)
      .optional(),
    attachments: z.array(patchAttachmentSchema).max(10).nullable().optional(),
    classId: z.string().nullable().optional(),
    sectionId: z.string().nullable().optional(),
    publishedAt: z.string().datetime().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    renotify: z.boolean().optional(),
  })
  .refine(
    (v) => v.audience !== "CLASS" || (v.classId !== null && v.classId !== undefined),
    { message: "classId is required when audience = CLASS", path: ["classId"] },
  )
  .refine(
    (v) => v.audience !== "SECTION" || (v.sectionId !== null && v.sectionId !== undefined),
    { message: "sectionId is required when audience = SECTION", path: ["sectionId"] },
  )

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId) {
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  }
  if (!WRITE_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await prisma.announcement.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true, authorId: true },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (!PRIVILEGED_ROLES.includes(session.user.role) && existing.authorId !== session.user.id) {
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

  // Verify scoped IDs belong to this school.
  if (data.classId) {
    const klass = await prisma.class.findFirst({
      where: { id: data.classId, schoolId: session.user.schoolId },
      select: { id: true },
    })
    if (!klass) return NextResponse.json({ error: "Invalid class" }, { status: 422 })
  }
  if (data.sectionId) {
    const sec = await prisma.section.findFirst({
      where: { id: data.sectionId, schoolId: session.user.schoolId },
      select: { id: true },
    })
    if (!sec) return NextResponse.json({ error: "Invalid arm" }, { status: 422 })
  }

  // Audience switches reset the scope IDs on the wrong target.
  const nextAudience = data.audience
  const updated = await prisma.announcement.update({
    where: { id: existing.id },
    data: {
      title: data.title,
      body: data.body,
      audience: nextAudience,
      priority: data.priority,
      channels:
        data.channels === undefined ? undefined : (data.channels as NotificationChannel[]),
      attachments:
        data.attachments === undefined
          ? undefined
          : data.attachments === null
            ? Prisma.JsonNull
            : (data.attachments as unknown as Prisma.InputJsonValue),
      classId:
        nextAudience === undefined
          ? data.classId
          : nextAudience === "CLASS"
            ? (data.classId ?? null)
            : null,
      sectionId:
        nextAudience === undefined
          ? data.sectionId
          : nextAudience === "SECTION"
            ? (data.sectionId ?? null)
            : null,
      publishedAt: data.publishedAt === undefined ? undefined : data.publishedAt ? new Date(data.publishedAt) : null,
      expiresAt: data.expiresAt === undefined ? undefined : data.expiresAt ? new Date(data.expiresAt) : null,
    },
  })

  // Opt-in re-dispatch (default off). Only meaningful for live announcements —
  // future-scheduled ones will be picked up by the cron when their time comes.
  const isLive =
    !updated.publishedAt || updated.publishedAt.getTime() <= Date.now()
  let dispatch:
    | Awaited<ReturnType<typeof dispatchAnnouncement>>
    | null = null
  if (data.renotify && isLive) {
    dispatch = await dispatchAnnouncement(updated)
    await prisma.announcement.update({
      where: { id: updated.id },
      data: { dispatchedAt: new Date() },
    })
  }

  return NextResponse.json({ ok: true, dispatch })
}
