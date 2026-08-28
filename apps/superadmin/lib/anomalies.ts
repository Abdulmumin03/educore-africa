import { prisma } from "@/lib/db"

// Login anomaly detection.
//
// Only signals the platform can actually observe are implemented. There is no
// geo-IP database in this stack, so "new country" and "impossible travel"
// cannot be computed — claiming them from an IP string alone would be a
// guess dressed as a security finding. What IS observable: a session from an
// address the account has never used, repeated failures, and console sign-ins
// blocked by the allowlist.

export type AnomalyKind = "new_ip" | "many_ips" | "brute_force" | "blocked_ip" | "account_locked"

export type Anomaly = {
  id: string
  kind: AnomalyKind
  severity: "critical" | "warning" | "info"
  subject: string
  subjectId: string | null
  scope: "console" | "school"
  school: string | null
  schoolId: string | null
  ipAddress: string
  detail: string
  /** Most recent occurrence. */
  at: string
  /** Oldest occurrence in this group. Equal to `at` for a one-off. */
  firstAt: string
  /** How many identical events were collapsed into this row. */
  occurrences: number
  actionTaken: string | null
}

const LOOKBACK_DAYS = 14
const MANY_IPS_THRESHOLD = 4

export async function detectAnomalies(): Promise<{
  anomalies: Anomaly[]
  unavailable: string[]
}> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)

  const [consoleEvents, sessions] = await Promise.all([
    prisma.superAdminAuditLog.findMany({
      where: {
        createdAt: { gte: since },
        action: { in: ["IP_BLOCKED", "ACCOUNT_LOCKED", "LOGIN_FAILED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        action: true,
        ipAddress: true,
        details: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, isActive: true } },
      },
    }),
    prisma.session.findMany({
      where: { createdAt: { gte: since }, ipAddress: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        id: true,
        ipAddress: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
            schoolId: true,
            school: { select: { name: true } },
          },
        },
      },
    }),
  ])

  const anomalies: Anomaly[] = []

  for (const event of consoleEvents) {
    if (event.action === "IP_BLOCKED") {
      anomalies.push({
        id: `audit:${event.id}`,
        kind: "blocked_ip",
        severity: "warning",
        subject: event.user?.email ?? "Unknown account",
        subjectId: event.user?.id ?? null,
        scope: "console",
        school: null,
        schoolId: null,
        ipAddress: event.ipAddress,
        detail: "Console sign-in refused — address is not on the allowlist",
        at: event.createdAt.toISOString(),
        firstAt: event.createdAt.toISOString(),
        occurrences: 1,
        actionTaken: "Blocked automatically",
      })
    } else if (event.action === "ACCOUNT_LOCKED") {
      anomalies.push({
        id: `audit:${event.id}`,
        kind: "account_locked",
        severity: "critical",
        subject: event.user?.email ?? "Unknown account",
        subjectId: event.user?.id ?? null,
        scope: "console",
        school: null,
        schoolId: null,
        ipAddress: event.ipAddress,
        detail: "Locked for 15 minutes after five consecutive failures",
        at: event.createdAt.toISOString(),
        firstAt: event.createdAt.toISOString(),
        occurrences: 1,
        actionTaken: "Locked automatically",
      })
    }
  }

  // Brute force: five or more console failures from one address in the window.
  const failuresByIp = new Map<string, { count: number; latest: Date; email: string | null }>()
  for (const event of consoleEvents) {
    if (event.action !== "LOGIN_FAILED") continue
    const bucket = failuresByIp.get(event.ipAddress) ?? {
      count: 0,
      latest: event.createdAt,
      email: event.user?.email ?? null,
    }
    bucket.count += 1
    if (event.createdAt > bucket.latest) bucket.latest = event.createdAt
    failuresByIp.set(event.ipAddress, bucket)
  }
  for (const [ip, bucket] of failuresByIp) {
    if (bucket.count < 5) continue
    anomalies.push({
      id: `brute:${ip}`,
      kind: "brute_force",
      severity: "critical",
      subject: bucket.email ?? "Multiple accounts",
      subjectId: null,
      scope: "console",
      school: null,
      schoolId: null,
      ipAddress: ip,
      detail: `${bucket.count} failed console sign-ins from this address in ${LOOKBACK_DAYS} days`,
      at: bucket.latest.toISOString(),
      firstAt: bucket.latest.toISOString(),
      occurrences: 1,
      actionTaken: "Lockout applied per account",
    })
  }

  // School-side: an account signing in from an unusual number of addresses.
  const ipsByUser = new Map<
    string,
    { ips: Set<string>; latest: Date; latestIp: string; user: (typeof sessions)[number]["user"] }
  >()
  for (const session of sessions) {
    if (!session.ipAddress) continue
    const bucket = ipsByUser.get(session.user.id) ?? {
      ips: new Set<string>(),
      latest: session.createdAt,
      latestIp: session.ipAddress,
      user: session.user,
    }
    bucket.ips.add(session.ipAddress)
    if (session.createdAt > bucket.latest) {
      bucket.latest = session.createdAt
      bucket.latestIp = session.ipAddress
    }
    ipsByUser.set(session.user.id, bucket)
  }

  for (const [userId, bucket] of ipsByUser) {
    if (bucket.ips.size < MANY_IPS_THRESHOLD) continue
    anomalies.push({
      id: `ips:${userId}`,
      kind: "many_ips",
      severity: "warning",
      subject: bucket.user.email,
      subjectId: userId,
      scope: "school",
      school: bucket.user.school?.name ?? null,
      schoolId: bucket.user.schoolId,
      ipAddress: bucket.latestIp,
      detail: `Signed in from ${bucket.ips.size} different addresses in ${LOOKBACK_DAYS} days`,
      at: bucket.latest.toISOString(),
      firstAt: bucket.latest.toISOString(),
      occurrences: 1,
      actionTaken: bucket.user.isActive ? null : "Account already disabled",
    })
  }

  // Collapse repeats. The same address refused thirty times in a fortnight is
  // one finding, and listing it thirty times buries the distinct ones.
  const grouped = new Map<string, Anomaly>()
  for (const anomaly of anomalies) {
    const key = `${anomaly.kind}|${anomaly.subjectId ?? anomaly.subject}|${anomaly.ipAddress}`
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, { ...anomaly })
      continue
    }
    existing.occurrences += anomaly.occurrences
    if (anomaly.at > existing.at) existing.at = anomaly.at
    if (anomaly.firstAt < existing.firstAt) existing.firstAt = anomaly.firstAt
  }

  const result = [...grouped.values()].sort((a, b) => b.at.localeCompare(a.at))

  return {
    anomalies: result,
    unavailable: [
      "New country and impossible travel need a geo-IP database, which this platform does not have.",
      "Device fingerprinting is not collected, so 'new device' cannot be distinguished from a cleared cookie.",
    ],
  }
}
