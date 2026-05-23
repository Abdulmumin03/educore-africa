import { NextResponse } from "next/server"
import { z } from "zod"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { resolveSmsAudience, sendBulkSms, type SmsAudience } from "@/lib/sms"

export const runtime = "nodejs"

const SEND_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "BURSAR"]

const audienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ALL_PARENTS") }),
  z.object({ type: z.literal("ALL_STAFF") }),
  z.object({ type: z.literal("CLASS_PARENTS"), classId: z.string().min(1) }),
  z.object({
    type: z.literal("CUSTOM"),
    phones: z.array(z.string().trim().min(7).max(20)).min(1).max(500),
  }),
])

const bodySchema = z.object({
  message: z.string().trim().min(1).max(640),
  audience: audienceSchema,
  scheduledAt: z.string().datetime().optional(),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!SEND_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)))

  const batches = await prisma.smsBatch.findMany({
    where: { schoolId: session.user.schoolId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      sender: { select: { firstName: true, lastName: true } },
    },
  })

  return NextResponse.json({
    items: batches.map((b) => ({
      id: b.id,
      audienceLabel: b.audienceLabel,
      message: b.message,
      status: b.status,
      scheduledAt: b.scheduledAt?.toISOString() ?? null,
      sentAt: b.sentAt?.toISOString() ?? null,
      totalCount: b.totalCount,
      deliveredCount: b.deliveredCount,
      failedCount: b.failedCount,
      sender: b.sender ? `${b.sender.firstName} ${b.sender.lastName}` : null,
      createdAt: b.createdAt.toISOString(),
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!SEND_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const { message, audience, scheduledAt } = parsed.data

  // CLASS_PARENTS — verify the class belongs to this school before resolving.
  if (audience.type === "CLASS_PARENTS") {
    const klass = await prisma.class.findFirst({
      where: { id: audience.classId, schoolId: session.user.schoolId },
      select: { id: true },
    })
    if (!klass) return NextResponse.json({ error: "Invalid class" }, { status: 422 })
  }

  const { recipients, label } = await resolveSmsAudience(
    session.user.schoolId,
    audience as SmsAudience,
  )

  if (recipients.length === 0) {
    return NextResponse.json({ error: "No recipients with a phone number" }, { status: 422 })
  }

  const result = await sendBulkSms(session.user.schoolId, recipients, message, {
    senderId: session.user.id,
    audienceLabel: label,
    audienceFilter: audience,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  })

  return NextResponse.json({
    ok: result.ok,
    batchId: result.batchId,
    totalCount: result.totalCount,
    deliveredCount: result.deliveredCount,
    failedCount: result.failedCount,
    scheduled: !!scheduledAt && new Date(scheduledAt).getTime() > Date.now(),
    error: result.error,
  })
}
