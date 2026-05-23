import { NextResponse } from "next/server"
import { z } from "zod"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendEmail } from "@/lib/email"
import { sendPush } from "@/lib/push"
import { sendBulkSms } from "@/lib/sms"
import { sendWhatsAppMessage } from "@/lib/whatsapp"

export const runtime = "nodejs"

const SEND_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const bodySchema = z.object({
  alertType: z.enum(["SCHOOL_CLOSURE", "SECURITY_INCIDENT", "HEALTH_ALERT", "OTHER"]),
  title: z.string().trim().min(2).max(120),
  message: z.string().trim().min(2).max(640),
  confirm: z.literal(true),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!SEND_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? 10)))

  const items = await prisma.emergencyAlert.findMany({
    where: { schoolId: session.user.schoolId, deletedAt: null },
    orderBy: { sentAt: "desc" },
    take: limit,
    include: { sender: { select: { firstName: true, lastName: true } } },
  })

  // Reachability counts give the UI a confirmation breakdown before firing.
  const [parentCount, staffCount, smsCount, emailCount] = await Promise.all([
    prisma.user.count({
      where: { schoolId: session.user.schoolId, role: "PARENT", isActive: true, deletedAt: null },
    }),
    prisma.user.count({
      where: {
        schoolId: session.user.schoolId,
        role: {
          in: ["SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "BURSAR", "COUNSELOR", "LIBRARIAN", "HOSTEL_MASTER", "DRIVER"],
        },
        isActive: true,
        deletedAt: null,
      },
    }),
    prisma.user.count({
      where: {
        schoolId: session.user.schoolId,
        isActive: true,
        deletedAt: null,
        phone: { not: null },
        role: { in: ["PARENT", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "BURSAR", "COUNSELOR", "LIBRARIAN", "HOSTEL_MASTER", "DRIVER"] },
      },
    }),
    prisma.user.count({
      where: {
        schoolId: session.user.schoolId,
        isActive: true,
        deletedAt: null,
        role: { in: ["PARENT", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "BURSAR", "COUNSELOR", "LIBRARIAN", "HOSTEL_MASTER", "DRIVER"] },
      },
    }),
  ])

  return NextResponse.json({
    items: items.map((a) => ({
      id: a.id,
      alertType: a.alertType,
      title: a.title,
      message: a.message,
      recipientCount: a.recipientCount,
      channelCounts: a.channelCounts,
      sender: a.sender ? `${a.sender.firstName} ${a.sender.lastName}` : null,
      sentAt: a.sentAt.toISOString(),
    })),
    reach: {
      parents: parentCount,
      staff: staffCount,
      sms: smsCount,
      email: emailCount,
    },
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
      { error: "Validation failed — confirmation required", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { alertType, title, message } = parsed.data

  // Pull everyone we can plausibly reach: all parents + all staff.
  const users = await prisma.user.findMany({
    where: {
      schoolId: session.user.schoolId,
      isActive: true,
      deletedAt: null,
      role: {
        in: [
          "PARENT",
          "SCHOOL_ADMIN",
          "PRINCIPAL",
          "TEACHER",
          "BURSAR",
          "COUNSELOR",
          "LIBRARIAN",
          "HOSTEL_MASTER",
          "DRIVER",
          "STUDENT",
        ],
      },
    },
    select: { id: true, email: true, phone: true },
  })

  const recipientCount = users.length

  // Channel: SMS — bulk to anyone with a phone number.
  const smsRecipients = users
    .filter((u) => !!u.phone)
    .map((u) => ({ userId: u.id, phone: u.phone! }))

  const smsBody = `EMERGENCY [${alertType.replace("_", " ")}]: ${title}. ${message}`.slice(0, 640)
  const smsResult =
    smsRecipients.length > 0
      ? await sendBulkSms(session.user.schoolId, smsRecipients, smsBody, {
          senderId: session.user.id,
          audienceLabel: `Emergency · ${alertType}`,
        })
      : { totalCount: 0, deliveredCount: 0, failedCount: 0 }

  // Channel: WhatsApp — fire-and-forget templated messages.
  let whatsappAttempts = 0
  for (const u of users) {
    if (!u.phone) continue
    whatsappAttempts++
    void sendWhatsAppMessage(u.phone, "announcement", [title, message]).catch((err) =>
      console.error("[emergency/whatsapp]", err),
    )
  }

  // Channel: Push — fire-and-forget per user.
  let pushAttempts = 0
  for (const u of users) {
    pushAttempts++
    void sendPush(u.id, { title: `EMERGENCY: ${title}`, body: message }).catch((err) =>
      console.error("[emergency/push]", err),
    )
  }

  // Channel: Email — fire-and-forget per user.
  let emailAttempts = 0
  for (const u of users) {
    if (!u.email) continue
    emailAttempts++
    void sendEmail({
      to: u.email,
      subject: `EMERGENCY [${alertType.replace("_", " ")}]: ${title}`,
      html: `<p><strong>${title}</strong></p><p>${message}</p><p>Sent by your school administration. If you received this in error, contact the school office.</p>`,
      text: `EMERGENCY [${alertType}]: ${title}\n\n${message}`,
    }).catch((err) => console.error("[emergency/email]", err))
  }

  // Channel: IN_APP — write Notification rows for the bell.
  await prisma.notification.createMany({
    data: users.map((u) => ({
      schoolId: session.user.schoolId!,
      userId: u.id,
      channel: "IN_APP" as const,
      title: `EMERGENCY: ${title}`,
      body: message,
      metadata: { alertType },
      sentAt: new Date(),
    })),
  })

  const channelCounts = {
    sms: smsRecipients.length,
    smsDelivered: smsResult.deliveredCount,
    whatsapp: whatsappAttempts,
    push: pushAttempts,
    email: emailAttempts,
    inApp: users.length,
  }

  const alert = await prisma.emergencyAlert.create({
    data: {
      schoolId: session.user.schoolId,
      senderId: session.user.id,
      alertType,
      title,
      message,
      recipientCount,
      channelCounts,
    },
  })

  return NextResponse.json({
    ok: true,
    alertId: alert.id,
    recipientCount,
    channelCounts,
  })
}
