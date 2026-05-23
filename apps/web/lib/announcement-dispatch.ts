import type { Announcement, NotificationChannel } from "@prisma/client"
import { prisma } from "@/lib/db"
import { sendEmail } from "@/lib/email"
import { sendSms } from "@/lib/sms"
import { sendWhatsApp } from "@/lib/whatsapp"
import { sendPush } from "@/lib/push"
import { renderMarkdown, markdownToPlainText } from "@/lib/markdown"

const RECIPIENT_CAP = 500

// Defaults must match /api/me/notification-preferences/route.ts.
const CHANNEL_DEFAULTS: Record<NotificationChannel, boolean> = {
  EMAIL: true,
  SMS: true,
  WHATSAPP: false,
  PUSH: true,
  IN_APP: true,
}

const STAFF_ROLES = [
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "LIBRARIAN",
  "HOSTEL_MASTER",
  "DRIVER",
] as const

type Recipient = {
  userId: string
  email: string
  phone: string | null
  prefs: Map<NotificationChannel, boolean>
}

/**
 * Resolve the set of users an announcement should reach. Returns at most
 * RECIPIENT_CAP entries. Authors are excluded — no point notifying yourself.
 */
async function resolveRecipients(announcement: Announcement): Promise<Recipient[]> {
  const schoolId = announcement.schoolId

  let userIds: string[] = []

  switch (announcement.audience) {
    case "ALL": {
      const rows = await prisma.user.findMany({
        where: { schoolId, isActive: true, deletedAt: null },
        select: { id: true },
        take: RECIPIENT_CAP,
      })
      userIds = rows.map((r) => r.id)
      break
    }
    case "STAFF": {
      const rows = await prisma.user.findMany({
        where: { schoolId, isActive: true, deletedAt: null, role: { in: [...STAFF_ROLES] } },
        select: { id: true },
        take: RECIPIENT_CAP,
      })
      userIds = rows.map((r) => r.id)
      break
    }
    case "STUDENTS": {
      const rows = await prisma.user.findMany({
        where: { schoolId, isActive: true, deletedAt: null, role: "STUDENT" },
        select: { id: true },
        take: RECIPIENT_CAP,
      })
      userIds = rows.map((r) => r.id)
      break
    }
    case "PARENTS": {
      const rows = await prisma.user.findMany({
        where: { schoolId, isActive: true, deletedAt: null, role: "PARENT" },
        select: { id: true },
        take: RECIPIENT_CAP,
      })
      userIds = rows.map((r) => r.id)
      break
    }
    case "CLASS":
    case "SECTION": {
      const enrollmentFilter =
        announcement.audience === "CLASS"
          ? { classId: announcement.classId ?? undefined }
          : { sectionId: announcement.sectionId ?? undefined }

      const enrollments = await prisma.enrollment.findMany({
        where: {
          schoolId,
          isActive: true,
          deletedAt: null,
          ...enrollmentFilter,
        },
        select: {
          student: {
            select: {
              userId: true,
              parents: { select: { parent: { select: { userId: true } } } },
            },
          },
        },
        take: RECIPIENT_CAP,
      })
      const set = new Set<string>()
      for (const e of enrollments) {
        set.add(e.student.userId)
        for (const sp of e.student.parents) set.add(sp.parent.userId)
        if (set.size >= RECIPIENT_CAP) break
      }
      userIds = Array.from(set).slice(0, RECIPIENT_CAP)
      break
    }
  }

  if (announcement.authorId) {
    userIds = userIds.filter((id) => id !== announcement.authorId)
  }
  if (userIds.length === 0) return []

  const [users, prefRows] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, phone: true },
    }),
    prisma.userNotificationPreference.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, channel: true, enabled: true },
    }),
  ])

  const prefsByUser = new Map<string, Map<NotificationChannel, boolean>>()
  for (const p of prefRows) {
    if (!prefsByUser.has(p.userId)) prefsByUser.set(p.userId, new Map())
    prefsByUser.get(p.userId)!.set(p.channel, p.enabled)
  }

  return users.map((u) => ({
    userId: u.id,
    email: u.email,
    phone: u.phone,
    prefs: prefsByUser.get(u.id) ?? new Map(),
  }))
}

function prefersChannel(r: Recipient, channel: NotificationChannel) {
  return r.prefs.get(channel) ?? CHANNEL_DEFAULTS[channel]
}

/**
 * Caller-selected channels short-circuit the default fan-out. Empty array
 * (the legacy default) means "use the existing all-channels behavior".
 */
function channelEnabled(
  announcement: Announcement,
  channel: NotificationChannel,
): boolean {
  const selected = announcement.channels ?? []
  if (selected.length === 0) return true
  return selected.includes(channel)
}

/**
 * Fan an announcement out across channels. Writes Notification rows synchronously
 * for IN_APP recipients (so the bell updates immediately); email and SMS are
 * fired without awaiting (best-effort delivery, errors logged).
 *
 * Returns the counts so the caller can surface them in the API response.
 */
export async function dispatchAnnouncement(announcement: Announcement): Promise<{
  recipients: number
  inApp: number
  email: number
  sms: number
  whatsapp: number
  push: number
  capped: boolean
}> {
  const recipients = await resolveRecipients(announcement)
  if (recipients.length === 0) {
    return { recipients: 0, inApp: 0, email: 0, sms: 0, whatsapp: 0, push: 0, capped: false }
  }

  const capped = recipients.length >= RECIPIENT_CAP

  // IN_APP — write Notification rows in one batch.
  const inAppUsers = channelEnabled(announcement, "IN_APP")
    ? recipients.filter((r) => prefersChannel(r, "IN_APP"))
    : []
  if (inAppUsers.length > 0) {
    await prisma.notification.createMany({
      data: inAppUsers.map((r) => ({
        schoolId: announcement.schoolId,
        userId: r.userId,
        channel: "IN_APP" as const,
        title: announcement.title,
        body: markdownToPlainText(announcement.body, 240),
        metadata: { announcementId: announcement.id },
        sentAt: new Date(),
      })),
      skipDuplicates: true,
    })
  }

  // EMAIL — fire-and-forget per recipient.
  const html = renderMarkdown(announcement.body)
  const plain = markdownToPlainText(announcement.body, 4000)
  const emailUsers = channelEnabled(announcement, "EMAIL")
    ? recipients.filter((r) => prefersChannel(r, "EMAIL"))
    : []
  for (const r of emailUsers) {
    void sendEmail({
      to: r.email,
      subject: announcement.title,
      html,
      text: plain,
    }).catch((err) => console.error("[announcement/email]", err))
  }

  // SMS — fire-and-forget, only for recipients with a phone number.
  const smsBody = `${announcement.title}: ${markdownToPlainText(announcement.body, 200)}`
  const smsUsers = channelEnabled(announcement, "SMS")
    ? recipients.filter((r) => r.phone && prefersChannel(r, "SMS"))
    : []
  for (const r of smsUsers) {
    void sendSms(r.phone!, smsBody).catch((err) => console.error("[announcement/sms]", err))
  }

  // WhatsApp — fire-and-forget, only for recipients with a phone number.
  // Provider is stubbed in lib/whatsapp.ts; calls no-op until configured.
  const waBody = `*${announcement.title}*\n${markdownToPlainText(announcement.body, 800)}`
  const waUsers = channelEnabled(announcement, "WHATSAPP")
    ? recipients.filter((r) => r.phone && prefersChannel(r, "WHATSAPP"))
    : []
  for (const r of waUsers) {
    void sendWhatsApp(r.phone!, waBody).catch((err) =>
      console.error("[announcement/whatsapp]", err),
    )
  }

  // Push — fire-and-forget. Stubbed in lib/push.ts; no-op until VAPID is set.
  const pushPayload = {
    title: announcement.title,
    body: markdownToPlainText(announcement.body, 140),
    url: `/dashboard/announcements`,
  }
  const pushUsers = channelEnabled(announcement, "PUSH")
    ? recipients.filter((r) => prefersChannel(r, "PUSH"))
    : []
  for (const r of pushUsers) {
    void sendPush(r.userId, pushPayload).catch((err) =>
      console.error("[announcement/push]", err),
    )
  }

  if (capped) {
    console.warn(
      `[announcement/dispatch] recipient cap hit (${RECIPIENT_CAP}) for announcement ${announcement.id}; consider a background worker for larger audiences`,
    )
  }

  return {
    recipients: recipients.length,
    inApp: inAppUsers.length,
    email: emailUsers.length,
    sms: smsUsers.length,
    whatsapp: waUsers.length,
    push: pushUsers.length,
    capped,
  }
}

export const ANNOUNCEMENT_RECIPIENT_CAP = RECIPIENT_CAP
