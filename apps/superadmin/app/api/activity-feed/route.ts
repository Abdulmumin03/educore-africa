import { prisma } from "@/lib/db"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

// Server-Sent Events. Like the notification feed, events are DERIVED from
// rows that already exist rather than published to a bus — the stream polls
// the database every few seconds and emits only what is newer than the last
// cursor it sent, so a reconnect never replays.

export type ActivityType =
  | "school_signup"
  | "payment_received"
  | "ticket_opened"
  | "school_suspended"
  | "user_login_anomaly"

export type ActivityEvent = {
  id: string
  type: ActivityType
  message: string
  school: string | null
  link: string
  at: string
}

const POLL_MS = 5_000
const BACKFILL = 20
// Without this the connection is held open indefinitely by a dev server that
// never notices the client is gone.
const MAX_LIFETIME_MS = 10 * 60_000

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
})

async function eventsSince(since: Date, limit: number): Promise<ActivityEvent[]> {
  const [schools, payments, tickets, suspended, anomalies] = await Promise.all([
    prisma.school.findMany({
      where: { deletedAt: null, createdAt: { gt: since } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, name: true, state: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { deletedAt: null, paidAt: { gt: since } },
      orderBy: { paidAt: "desc" },
      take: limit,
      select: { id: true, amount: true, paidAt: true, schoolId: true, school: { select: { name: true } } },
    }),
    prisma.supportTicket.findMany({
      where: { createdAt: { gt: since } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, title: true, priority: true, createdAt: true, school: { select: { name: true } } },
    }),
    prisma.schoolSubscription.findMany({
      where: { status: "SUSPENDED", updatedAt: { gt: since } },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { schoolId: true, updatedAt: true, school: { select: { name: true } } },
    }),
    prisma.superAdminAuditLog.findMany({
      where: {
        createdAt: { gt: since },
        action: { in: ["IP_BLOCKED", "ACCOUNT_LOCKED", "LOGIN_FAILED"] },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, action: true, ipAddress: true, createdAt: true },
    }),
  ])

  const events: ActivityEvent[] = [
    ...schools.map((school) => ({
      id: `school:${school.id}`,
      type: "school_signup" as const,
      message: `${school.name} signed up`,
      school: school.name,
      link: `/console/schools/${school.id}`,
      at: school.createdAt.toISOString(),
    })),
    ...payments.map((payment) => ({
      id: `payment:${payment.id}`,
      type: "payment_received" as const,
      message: `${naira.format(Number(payment.amount))} received`,
      school: payment.school.name,
      link: `/console/schools/${payment.schoolId}`,
      at: payment.paidAt.toISOString(),
    })),
    ...tickets.map((ticket) => ({
      id: `ticket:${ticket.id}`,
      type: "ticket_opened" as const,
      message: `${ticket.priority.toLowerCase()} ticket — ${ticket.title}`,
      school: ticket.school.name,
      link: "/console/support",
      at: ticket.createdAt.toISOString(),
    })),
    ...suspended.map((row) => ({
      id: `suspend:${row.schoolId}:${row.updatedAt.getTime()}`,
      type: "school_suspended" as const,
      message: "Subscription suspended",
      school: row.school.name,
      link: `/console/schools/${row.schoolId}`,
      at: row.updatedAt.toISOString(),
    })),
    ...anomalies.map((row) => ({
      id: `anomaly:${row.id}`,
      type: "user_login_anomaly" as const,
      message:
        row.action === "IP_BLOCKED"
          ? `Blocked console sign-in from ${row.ipAddress}`
          : row.action === "ACCOUNT_LOCKED"
            ? "Console account locked after repeated failures"
            : `Failed console sign-in from ${row.ipAddress}`,
      school: null,
      link: "/console/audit",
      at: row.createdAt.toISOString(),
    })),
  ]

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const encoder = new TextEncoder()
  const startedAt = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }

      // Backfill so the panel is populated on first paint, then only deltas.
      const backfill = await eventsSince(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), BACKFILL)
      send("backfill", { events: backfill })

      let cursor = backfill.length > 0 ? new Date(backfill[0].at) : new Date()

      const timer = setInterval(async () => {
        if (closed) return
        if (Date.now() - startedAt > MAX_LIFETIME_MS) {
          send("bye", { reason: "max-lifetime" })
          cleanup()
          return
        }
        try {
          const fresh = await eventsSince(cursor, BACKFILL)
          if (fresh.length > 0) {
            cursor = new Date(fresh[0].at)
            send("activity", { events: fresh })
          } else {
            // Comment frame keeps proxies from timing the connection out.
            controller.enqueue(encoder.encode(": keep-alive\n\n"))
          }
        } catch {
          cleanup()
        }
      }, POLL_MS)

      function cleanup() {
        if (closed) return
        closed = true
        clearInterval(timer)
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      request.signal.addEventListener("abort", cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx buffers SSE into uselessness without this.
      "X-Accel-Buffering": "no",
    },
  })
}
