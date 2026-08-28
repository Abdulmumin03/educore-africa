import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

// The feed is DERIVED, not stored: there is no notification table, and one
// would only duplicate rows that already exist. Each source is queried for
// its most recent entries and merged. Read state is a single watermark on the
// admin (notificationsReadAt), so "mark all read" is one UPDATE.

export type NotificationType =
  | "school_signup"
  | "payment_received"
  | "ticket_opened"
  | "system_alert"

export type Notification = {
  id: string
  type: NotificationType
  message: string
  link: string
  createdAt: string
  isRead: boolean
}

const PER_SOURCE = 10
const RETURNED = 10
// Nothing older than this is worth surfacing as a notification.
const WINDOW_DAYS = 14

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
})

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const [account, schools, payments, tickets, alerts] = await Promise.all([
    prisma.superAdminUser.findUnique({
      where: { id: guard.user.id },
      select: { notificationsReadAt: true },
    }),
    prisma.school.findMany({
      where: { deletedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, name: true, state: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { deletedAt: null, paidAt: { gte: since } },
      orderBy: { paidAt: "desc" },
      take: PER_SOURCE,
      select: {
        id: true,
        amount: true,
        paidAt: true,
        schoolId: true,
        school: { select: { name: true } },
      },
    }),
    prisma.supportTicket.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: {
        id: true,
        title: true,
        priority: true,
        createdAt: true,
        school: { select: { name: true } },
      },
    }),
    prisma.superAdminAuditLog.findMany({
      where: {
        createdAt: { gte: since },
        action: { in: ["IP_BLOCKED", "ACCOUNT_LOCKED", "SESSION_REVOKED"] },
      },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { id: true, action: true, ipAddress: true, createdAt: true },
    }),
  ])

  const readAt = account?.notificationsReadAt ?? null
  const isRead = (at: Date) => (readAt ? at <= readAt : false)

  const feed: Notification[] = [
    ...schools.map((school) => ({
      id: `school:${school.id}`,
      type: "school_signup" as const,
      message: `${school.name} registered${school.state ? ` · ${school.state}` : ""}`,
      link: `/console/schools/${school.id}`,
      createdAt: school.createdAt.toISOString(),
      isRead: isRead(school.createdAt),
    })),
    ...payments.map((payment) => ({
      id: `payment:${payment.id}`,
      type: "payment_received" as const,
      message: `${naira.format(Number(payment.amount))} received — ${payment.school.name}`,
      link: `/console/revenue?school=${payment.schoolId}`,
      createdAt: payment.paidAt.toISOString(),
      isRead: isRead(payment.paidAt),
    })),
    ...tickets.map((ticket) => ({
      id: `ticket:${ticket.id}`,
      type: "ticket_opened" as const,
      message: `${ticket.priority} ticket — ${ticket.school.name}: ${ticket.title}`,
      link: `/console/support/${ticket.id}`,
      createdAt: ticket.createdAt.toISOString(),
      isRead: isRead(ticket.createdAt),
    })),
    ...alerts.map((alert) => ({
      id: `alert:${alert.id}`,
      type: "system_alert" as const,
      message:
        alert.action === "IP_BLOCKED"
          ? `Blocked sign-in attempt from ${alert.ipAddress}`
          : alert.action === "ACCOUNT_LOCKED"
            ? "A console account was locked after repeated failures"
            : "A console session was revoked",
      link: "/console/audit",
      createdAt: alert.createdAt.toISOString(),
      isRead: isRead(alert.createdAt),
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RETURNED)

  return NextResponse.json({
    notifications: feed,
    unreadCount: feed.filter((item) => !item.isRead).length,
  })
}
