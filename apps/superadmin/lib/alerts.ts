import { prisma } from "@/lib/db"

// "Action required" is derived, not stored — the same principle as the
// notification feed. Each type is one query against rows that already exist,
// so an alert can never drift from the thing it describes.

export type AlertType =
  | "overdue_renewal"
  | "failed_payment"
  | "inactive_school"
  | "system_warning"
  | "support_critical"

export type AlertSeverity = "critical" | "warning" | "info"

export type Alert = {
  id: string
  type: AlertType
  severity: AlertSeverity
  message: string
  detail: string
  link: string
  count: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const INACTIVE_DAYS = 21
const RENEWAL_WINDOW_DAYS = 7

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
})

export async function getAlerts(): Promise<Alert[]> {
  const now = new Date()
  const soon = new Date(now.getTime() + RENEWAL_WINDOW_DAYS * DAY_MS)
  const inactiveBefore = new Date(now.getTime() - INACTIVE_DAYS * DAY_MS)
  const recently = new Date(now.getTime() - 2 * DAY_MS)

  const [overdue, upcoming, pastDue, trialsEnding, criticalTickets, securityEvents] =
    await Promise.all([
      prisma.schoolSubscription.findMany({
        where: { status: { in: ["ACTIVE", "PAST_DUE"] }, renewsAt: { lt: now } },
        select: { schoolId: true, amount: true, school: { select: { name: true } } },
      }),
      prisma.schoolSubscription.count({
        where: { status: "ACTIVE", renewsAt: { gte: now, lte: soon } },
      }),
      prisma.schoolSubscription.findMany({
        where: { status: "PAST_DUE" },
        select: { schoolId: true, amount: true, cycle: true, school: { select: { name: true } } },
      }),
      prisma.schoolSubscription.count({
        where: { status: "TRIAL", trialEndsAt: { gte: now, lte: soon } },
      }),
      prisma.supportTicket.findMany({
        where: { priority: "CRITICAL", status: { in: ["OPEN", "IN_PROGRESS"] } },
        select: { id: true, title: true, school: { select: { name: true } } },
      }),
      prisma.superAdminAuditLog.count({
        where: {
          createdAt: { gte: recently },
          action: { in: ["IP_BLOCKED", "ACCOUNT_LOCKED"] },
        },
      }),
    ])

  // A school is inactive if no user has signed in for three weeks. Counted
  // separately because it needs the users relation, not the subscription.
  const inactive = await prisma.school.count({
    where: {
      deletedAt: null,
      subscription: { status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } },
      users: { none: { deletedAt: null, lastLoginAt: { gte: inactiveBefore } } },
    },
  })

  const alerts: Alert[] = []

  if (overdue.length > 0) {
    const value = overdue.reduce((sum, row) => sum + Number(row.amount), 0)
    alerts.push({
      id: "overdue_renewal",
      type: "overdue_renewal",
      severity: "critical",
      message: `${overdue.length} subscription${overdue.length === 1 ? "" : "s"} past their renewal date`,
      detail:
        overdue.length === 1
          ? `${overdue[0].school.name} · ${naira.format(Number(overdue[0].amount))}`
          : `${naira.format(value)} of billings not renewed`,
      link: "/console/schools?status=PAST_DUE",
      count: overdue.length,
    })
  }

  if (pastDue.length > 0) {
    const monthly = pastDue.reduce((sum, row) => sum + Number(row.amount), 0)
    alerts.push({
      id: "failed_payment",
      type: "failed_payment",
      severity: "critical",
      message: `${pastDue.length} school${pastDue.length === 1 ? "" : "s"} in payment arrears`,
      detail: `${naira.format(monthly)} outstanding · ${pastDue
        .slice(0, 2)
        .map((row) => row.school.name)
        .join(", ")}${pastDue.length > 2 ? ` +${pastDue.length - 2} more` : ""}`,
      link: "/console/schools?status=PAST_DUE",
      count: pastDue.length,
    })
  }

  if (criticalTickets.length > 0) {
    alerts.push({
      id: "support_critical",
      type: "support_critical",
      severity: "critical",
      message: `${criticalTickets.length} critical support ticket${criticalTickets.length === 1 ? "" : "s"} open`,
      detail: criticalTickets
        .slice(0, 2)
        .map((ticket) => `${ticket.school.name}: ${ticket.title}`)
        .join(" · "),
      link: "/console/support",
      count: criticalTickets.length,
    })
  }

  if (trialsEnding > 0) {
    alerts.push({
      id: "trials_ending",
      type: "overdue_renewal",
      severity: "warning",
      message: `${trialsEnding} trial${trialsEnding === 1 ? "" : "s"} end within ${RENEWAL_WINDOW_DAYS} days`,
      detail: "Convert or extend before they lapse.",
      link: "/console/schools?status=TRIAL",
      count: trialsEnding,
    })
  }

  if (upcoming > 0) {
    alerts.push({
      id: "renewals_upcoming",
      type: "overdue_renewal",
      severity: "info",
      message: `${upcoming} renewal${upcoming === 1 ? "" : "s"} due within ${RENEWAL_WINDOW_DAYS} days`,
      detail: "Nothing to do unless payment fails.",
      link: "/console/revenue",
      count: upcoming,
    })
  }

  if (inactive > 0) {
    alerts.push({
      id: "inactive_school",
      type: "inactive_school",
      severity: "warning",
      message: `${inactive} paying school${inactive === 1 ? "" : "s"} with no logins for ${INACTIVE_DAYS} days`,
      detail: "The strongest churn signal there is.",
      link: "/console/schools?sort=health",
      count: inactive,
    })
  }

  if (securityEvents > 0) {
    alerts.push({
      id: "system_warning",
      type: "system_warning",
      severity: "warning",
      message: `${securityEvents} blocked sign-in${securityEvents === 1 ? "" : "s"} or lockout${securityEvents === 1 ? "" : "s"} in 48h`,
      detail: "Console access attempts from outside the allowlist.",
      link: "/console/audit",
      count: securityEvents,
    })
  }

  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => order[a.severity] - order[b.severity])
}
