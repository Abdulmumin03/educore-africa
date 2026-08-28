import { Prisma } from "@prisma/client"
import type {
  BroadcastAudience,
  NotificationChannel,
  SchoolPlan,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client"

import { prisma } from "@/lib/db"

// Platform broadcasts.
//
// Honest scope: the console owns the in-app inbox, so IN_APP messages are
// written here and land immediately. SMS and EMAIL belong to the school app's
// worker (Africa's Talking / the mail sender live there, with the school's own
// credit balance) — the console records that they were requested and reports
// zero sent, rather than claiming a dispatch it did not make.

export const DISPATCHABLE_CHANNELS: NotificationChannel[] = ["IN_APP"]

export type AudienceFilter = {
  plans?: SchoolPlan[]
  states?: string[]
  statuses?: SubscriptionStatus[]
  schoolIds?: string[]
}

/** Which school-side roles receive a platform broadcast. */
export const BROADCAST_RECIPIENT_ROLES: UserRole[] = ["SCHOOL_ADMIN", "PRINCIPAL"]

export function audienceWhere(
  audience: BroadcastAudience,
  filter: AudienceFilter,
): Prisma.SchoolWhereInput {
  const base: Prisma.SchoolWhereInput = { deletedAt: null }

  switch (audience) {
    case "ALL":
      return base
    case "BY_PLAN":
      // Plan and status live on SchoolSubscription, not School — a school with
      // no subscription row matches neither, which is the right answer.
      return { ...base, subscription: { is: { plan: { in: filter.plans ?? [] } } } }
    case "BY_STATE":
      return { ...base, state: { in: filter.states ?? [] } }
    case "BY_STATUS":
      return { ...base, subscription: { is: { status: { in: filter.statuses ?? [] } } } }
    case "CUSTOM":
      return { ...base, id: { in: filter.schoolIds ?? [] } }
  }
}

/** Count schools and recipients without sending — powers the preview panel. */
export async function previewAudience(audience: BroadcastAudience, filter: AudienceFilter) {
  const where = audienceWhere(audience, filter)

  const [schools, recipients, sample] = await Promise.all([
    prisma.school.count({ where }),
    prisma.user.count({
      where: {
        deletedAt: null,
        isActive: true,
        role: { in: BROADCAST_RECIPIENT_ROLES },
        school: { is: where },
      },
    }),
    prisma.school.findMany({
      where,
      orderBy: { name: "asc" },
      take: 5,
      select: {
        id: true,
        name: true,
        state: true,
        subscription: { select: { plan: true, status: true } },
      },
    }),
  ])

  return { schools, recipients, sample }
}

export type SendResult = {
  broadcastId: string
  schools: number
  recipients: number
  inAppSent: number
  /** Channels asked for but not dispatched here, with the reason. */
  deferred: Array<{ channel: NotificationChannel; reason: string }>
}

const DEFERRAL_REASONS: Partial<Record<NotificationChannel, string>> = {
  SMS: "SMS is dispatched by the school app's worker against each school's own credit balance. Recorded as requested; nothing was sent from the console.",
  EMAIL:
    "Email is dispatched by the school app's mail sender. Recorded as requested; nothing was sent from the console.",
  WHATSAPP:
    "WhatsApp templates are registered per school in the school app. Recorded as requested; nothing was sent from the console.",
  PUSH: "Push delivery is not wired up on this platform. Recorded as requested only.",
}

export async function sendBroadcast(input: {
  title: string
  body: string
  audience: BroadcastAudience
  filter: AudienceFilter
  channels: NotificationChannel[]
  createdById: string
}): Promise<SendResult> {
  const where = audienceWhere(input.audience, input.filter)

  const schools = await prisma.school.findMany({ where, select: { id: true } })
  const schoolIds = schools.map((school) => school.id)

  const recipients = schoolIds.length
    ? await prisma.user.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          role: { in: BROADCAST_RECIPIENT_ROLES },
          schoolId: { in: schoolIds },
        },
        select: { id: true, schoolId: true },
      })
    : []

  const broadcast = await prisma.broadcast.create({
    data: {
      title: input.title,
      body: input.body,
      audience: input.audience,
      audienceFilter: input.filter as Prisma.InputJsonValue,
      channels: input.channels,
      status: "SENDING",
      schoolCount: schoolIds.length,
      recipientCount: recipients.length,
      createdById: input.createdById,
    },
    select: { id: true },
  })

  let inAppSent = 0
  if (input.channels.includes("IN_APP") && recipients.length > 0) {
    // Notification is per-user, not per-school, so one row each.
    const rows = recipients
      .filter((user): user is { id: string; schoolId: string } => user.schoolId !== null)
      .map((user) => ({
        schoolId: user.schoolId,
        userId: user.id,
        channel: "IN_APP" as const,
        title: input.title,
        body: input.body,
        metadata: { source: "platform-broadcast", broadcastId: broadcast.id } as Prisma.InputJsonValue,
        sentAt: new Date(),
      }))

    const created = await prisma.notification.createMany({ data: rows })
    inAppSent = created.count
  }

  const deferred = input.channels
    .filter((channel) => !DISPATCHABLE_CHANNELS.includes(channel))
    .map((channel) => ({
      channel,
      reason: DEFERRAL_REASONS[channel] ?? "Not dispatched from the console.",
    }))

  await prisma.broadcast.update({
    where: { id: broadcast.id },
    data: { status: "SENT", sentAt: new Date(), inAppSent },
  })

  return {
    broadcastId: broadcast.id,
    schools: schoolIds.length,
    recipients: recipients.length,
    inAppSent,
    deferred,
  }
}

export async function listBroadcasts(limit = 25) {
  const rows = await prisma.broadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      body: true,
      audience: true,
      channels: true,
      status: true,
      schoolCount: true,
      recipientCount: true,
      inAppSent: true,
      sentAt: true,
      createdAt: true,
      createdById: true,
    },
  })

  const authors = await prisma.superAdminUser.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.createdById))] } },
    select: { id: true, name: true },
  })
  const names = new Map(authors.map((author) => [author.id, author.name]))

  return rows.map((row) => ({
    ...row,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: names.get(row.createdById) ?? "Unknown",
  }))
}
