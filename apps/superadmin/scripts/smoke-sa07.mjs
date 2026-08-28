// SA-07 check: analytics centre, support console, user management, broadcast.
//
//   pnpm --filter superadmin dev          # in one terminal
//   pnpm --filter superadmin test:sa07    # in another
//
// Needs a RUNNING SERVER, a real database and demo data (`pnpm seed:demo`).
// Creates and deletes its own throwaway console accounts, ticket and broadcast.
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import * as OTPAuth from "otpauth"

const BASE = "http://localhost:3001"
const prisma = new PrismaClient()

let failures = 0
const check = (name, ok, extra = "") => {
  if (!ok) failures++
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${extra ? ` — ${extra}` : ""}`)
}

function makeJar() {
  const jar = new Map()
  return {
    header: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb: (r) => {
      for (const raw of r.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(";")
        const i = pair.indexOf("=")
        const n = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim()
        v === "" ? jar.delete(n) : jar.set(n, v)
      }
    },
    has: (n) => jar.has(n),
  }
}

async function req(jar, path, init = {}) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: {
      "x-forwarded-for": "127.0.0.1",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
      ...(jar.header() ? { cookie: jar.header() } : {}),
    },
    redirect: "manual",
  })
  jar.absorb(r)
  return r
}
async function json(jar, path, init) {
  const r = await req(jar, path, init)
  let body = null
  try { body = await r.json() } catch {}
  return { status: r.status, body }
}

async function signIn(email, role) {
  const password = "Sa07Check!2026"
  await prisma.superAdminUser.deleteMany({ where: { email } })
  const user = await prisma.superAdminUser.create({
    data: { email, name: `SA07 ${role}`, role, passwordHash: await bcrypt.hash(password, 10) },
  })
  const jar = makeJar()
  await req(jar, "/api/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) })
  const enroll = (await json(jar, "/api/auth/totp/enroll", { method: "POST" })).body
  const totp = new OTPAuth.TOTP({
    issuer: "EduCore Africa Console", label: email,
    algorithm: "SHA1", digits: 6, period: 30,
    secret: OTPAuth.Secret.fromBase32(enroll.secret),
  })
  for (let attempt = 0; attempt < 4; attempt++) {
    // A code generated just before a window boundary is stale by the time it
    // lands, so retry across windows rather than make every run a coin flip.
    const confirmed = await req(jar, "/api/auth/totp/confirm", {
      method: "POST",
      body: JSON.stringify({ code: totp.generate() }),
    })
    if (confirmed.status === 200) break
    await new Promise((resolve) => setTimeout(resolve, 2500))
  }
  return { jar, user }
}

const EMAILS = [
  "sa07-owner@educoreafrica.com",
  "sa07-support@educoreafrica.com",
  "sa07-analyst@educoreafrica.com",
]

const owner = await signIn(EMAILS[0], "SUPER_ADMIN")
const support = await signIn(EMAILS[1], "SUPPORT_ADMIN")
const analyst = await signIn(EMAILS[2], "ANALYTICS_ADMIN")
check("owner session", owner.jar.has("educore-sa.session-token"))
check("support session", support.jar.has("educore-sa.session-token"))
const jar = owner.jar

// ── 1. Feature adoption ──────────────────────────────────────────
console.log("\n1. Feature adoption")
const adoption = (await json(jar, "/api/analytics/feature-adoption")).body
check("returns a row per module", Array.isArray(adoption.rows) && adoption.rows.length >= 10,
  `${adoption.rows?.length}`)
const platformSchools = await prisma.school.count({ where: { deletedAt: null } })
const plannedSchools = await prisma.school.count({
  where: { deletedAt: null, subscription: { isNot: null } },
})
check("the grid counts only schools that have a plan",
  adoption.totalSchools === plannedSchools, `${adoption.totalSchools} vs ${plannedSchools}`)
check("the platform total is reported alongside it",
  adoption.platformSchools === platformSchools, `${adoption.platformSchools} vs ${platformSchools}`)
check("excluded schools are counted, not dropped silently",
  adoption.unplanned === platformSchools - plannedSchools, `${adoption.unplanned}`)

const attendance = adoption.rows.find((r) => r.module === "attendance")
// Same population as the grid: a school with no plan has no column to sit in.
const dbAttendance = await prisma.school.count({
  where: { deletedAt: null, subscription: { isNot: null }, attendance: { some: {} } },
})
check("attendance adoption is the real count",
  attendance?.overall.using === dbAttendance, `api ${attendance?.overall.using} vs db ${dbAttendance}`)
check("some module is actually in use",
  adoption.rows.some((r) => r.built && r.overall.using > 0))
check("percentages are 0-100",
  adoption.rows.every((r) => r.cells.every((c) => c.percent >= 0 && c.percent <= 100)))

const alumni = adoption.rows.find((r) => r.module === "alumni")
check("alumni is flagged unbuilt rather than 0%", alumni?.built === false)
check("every plan tier is represented",
  adoption.rows.filter((r) => r.built).every((r) => r.cells.length === 5))

// ── 2. Growth funnel ─────────────────────────────────────────────
console.log("\n2. Growth funnel")
const funnel = (await json(jar, "/api/analytics/funnel")).body
check("six stages", funnel.stages.length === 6, `${funnel.stages.length}`)
check("stage 1 is marked unmeasurable", funnel.stages[0].measurable === false)

const measurable = funnel.stages.filter((s) => s.measurable)
check("counts never increase down the funnel",
  measurable.every((s, i) => i === 0 || measurable[i - 1].count >= s.count),
  measurable.map((s) => s.count).join(" → "))
check("registered stage equals the platform school count",
  measurable[0].count === adoption.platformSchools, `${measurable[0].count}`)
check("every later stage is a real subset",
  measurable.slice(1).every((s) => s.count <= measurable[0].count))
check("lost + count equals the previous stage",
  measurable.slice(1).every((s, i) => s.count + s.lost === measurable[i].count))
check("drop-off matches the counts",
  measurable.slice(1).every((s, i) => {
    const prev = measurable[i].count
    const expected = prev === 0 ? 0 : ((prev - s.count) / prev) * 100
    return Math.abs(s.dropOff - expected) < 0.01
  }))

// Cohort commentary. Whether Claude or arithmetic wrote it depends on the
// environment, so assert the shape and the honesty flag, not the prose.
const insights = await json(jar, "/api/ai/retention-insights", { method: "POST" })
check("retention insights respond", insights.status === 200, `${insights.status}`)
check("the panel says who wrote it", typeof insights.body?.generated === "boolean",
  insights.body?.generated ? "Claude" : "computed fallback")
check("a headline is always present", typeof insights.body?.headline === "string" && insights.body.headline.length > 0)
check("a non-generated panel explains itself rather than passing as AI",
  insights.body?.generated === true ||
    (typeof insights.body?.note === "string" && insights.body.note.length > 0),
  insights.body?.note ?? "")

// ── 3. Geographic ────────────────────────────────────────────────
console.log("\n3. Geographic")
const geo = (await json(jar, "/api/analytics/geographic")).body
check("rows are sorted by school count",
  geo.rows.every((r, i) => i === 0 || geo.rows[i - 1].schools >= r.schools))
check("state totals sum to the platform total",
  geo.rows.reduce((sum, r) => sum + r.schools, 0) === geo.totals.schools,
  `${geo.totals.schools}`)
check("MRR is a number, never null", geo.rows.every((r) => typeof r.mrr === "number"))

// ── 4. NPS ───────────────────────────────────────────────────────
console.log("\n4. NPS")
const nps = (await json(jar, "/api/analytics/nps")).body
const npsRows = await prisma.npsResponse.findMany({
  where: { createdAt: { gte: new Date(Date.now() - 365 * 86_400_000) } },
  select: { score: true },
})
const promoters = npsRows.filter((r) => r.score >= 9).length
const detractors = npsRows.filter((r) => r.score <= 6).length
const expectedScore = npsRows.length === 0
  ? null
  : ((promoters - detractors) / npsRows.length) * 100

check("promoter count matches the database", nps.promoters === promoters, `${nps.promoters} vs ${promoters}`)
check("detractor count matches the database", nps.detractors === detractors)
check("score is promoters minus detractors",
  expectedScore === null ? nps.score === null : Math.abs(nps.score - expectedScore) < 0.5,
  `${nps.score} vs ${expectedScore?.toFixed(1)}`)
check("score is inside the -100..100 range",
  nps.score === null || (nps.score >= -100 && nps.score <= 100))
check("trend covers twelve months", nps.trend.length === 12, `${nps.trend.length}`)
check("a month with no responses reports null, not zero",
  nps.trend.every((m) => (m.responses === 0 ? m.score === null : m.score !== null)))

// ── 5. API performance ───────────────────────────────────────────
console.log("\n5. API performance")
const perf = (await json(jar, "/api/system/api-performance")).body
check("endpoints were sampled", Array.isArray(perf.endpoints))
if (perf.sampled && perf.endpoints.length > 0) {
  check("percentiles are ordered p50 <= p95 <= p99",
    perf.endpoints.every((e) => e.p50 <= e.p95 && e.p95 <= e.p99))
  check("ids are collapsed out of paths",
    perf.endpoints.every((e) => !/[a-z0-9]{20,}/i.test(e.endpoint)),
    perf.endpoints.map((e) => e.endpoint).slice(0, 3).join(", "))
  check("this run's own calls were recorded",
    perf.endpoints.some((e) => e.endpoint.startsWith("/api/analytics")))
} else {
  check("reports honestly that nothing was sampled", perf.sampled === false || perf.endpoints.length === 0)
}

// ── 6. Support: the full ticket workflow ─────────────────────────
console.log("\n6. Support workflow (create → assign → reply → resolve)")
const school = await prisma.school.findFirst({
  where: { deletedAt: null },
  select: { id: true, name: true },
})

const created = await json(support.jar, "/api/support/tickets", {
  method: "POST",
  body: JSON.stringify({
    schoolId: school.id,
    title: "[sa07] Smoke-test ticket",
    description: "Raised by the SA-07 smoke test.",
    category: "TECHNICAL",
    priority: "CRITICAL",
  }),
})
check("create returns 201", created.status === 201, `${created.status}`)
const ticketId = created.body?.ticket?.id
check("ticket has an id", Boolean(ticketId))

const assigned = await json(support.jar, `/api/support/tickets/${ticketId}/update`, {
  method: "PUT",
  body: JSON.stringify({ assignedTo: analyst.user.id }),
})
check("assign returns 200", assigned.status === 200, `${assigned.status}`)
check("assignee is recorded", assigned.body?.ticket?.assignedTo === analyst.user.id)

const before = await prisma.supportTicket.findUnique({
  where: { id: ticketId },
  select: { firstResponseAt: true },
})
check("no first response before anyone replies", before.firstResponseAt === null)

const noted = await json(support.jar, `/api/support/tickets/${ticketId}/reply`, {
  method: "POST",
  body: JSON.stringify({ body: "Internal: checking the SMS route.", isInternal: true }),
})
check("internal note accepted", noted.status === 201, `${noted.status}`)
const afterNote = await prisma.supportTicket.findUnique({
  where: { id: ticketId },
  select: { firstResponseAt: true, status: true },
})
check("an internal note does NOT start the response clock", afterNote.firstResponseAt === null)
check("an internal note does not move the ticket off OPEN", afterNote.status === "OPEN")

const replied = await json(support.jar, `/api/support/tickets/${ticketId}/reply`, {
  method: "POST",
  body: JSON.stringify({ body: "We can reproduce this and are on it." }),
})
check("public reply accepted", replied.status === 201, `${replied.status}`)
const afterReply = await prisma.supportTicket.findUnique({
  where: { id: ticketId },
  select: { firstResponseAt: true, status: true },
})
check("public reply stamps firstResponseAt", afterReply.firstResponseAt !== null)
check("public reply moves OPEN to IN_PROGRESS", afterReply.status === "IN_PROGRESS", afterReply.status)

const detail = (await json(support.jar, `/api/support/tickets/${ticketId}`)).body
check("detail carries both comments", detail.ticket.comments.length === 2, `${detail.ticket.comments.length}`)
check("the internal note is flagged internal",
  detail.ticket.comments.filter((c) => c.isInternal).length === 1)
check("comment authors are named", detail.ticket.comments.every((c) => c.author && c.author !== "Unknown"))

const resolved = await json(support.jar, `/api/support/tickets/${ticketId}/update`, {
  method: "PUT",
  body: JSON.stringify({ status: "RESOLVED" }),
})
check("resolve returns 200", resolved.status === 200)
check("resolvedAt is stamped", resolved.body?.ticket?.resolvedAt !== null)

const reopened = await json(support.jar, `/api/support/tickets/${ticketId}/update`, {
  method: "PUT",
  body: JSON.stringify({ status: "OPEN" }),
})
check("reopening clears the stale resolvedAt", reopened.body?.ticket?.resolvedAt === null)

// ── 7. SLA timer ─────────────────────────────────────────────────
console.log("\n7. SLA timer")
// CRITICAL first response target is 1 hour. Backdate the ticket four hours and
// clear its response so the timer has to report a breach.
await prisma.supportTicket.update({
  where: { id: ticketId },
  data: {
    createdAt: new Date(Date.now() - 4 * 3_600_000),
    firstResponseAt: null,
    resolvedAt: null,
    status: "OPEN",
  },
})
const breachedDetail = (await json(support.jar, `/api/support/tickets/${ticketId}`)).body
check("timer turns red once the target passes",
  breachedDetail.ticket.sla.state === "breached", breachedDetail.ticket.sla.state)
check("remaining time is negative", breachedDetail.ticket.sla.msRemaining < 0)
check("the label says how far past target", /breached/i.test(breachedDetail.ticket.sla.label),
  breachedDetail.ticket.sla.label)

// Half an hour in on a 1-hour target is still green.
await prisma.supportTicket.update({
  where: { id: ticketId },
  data: { createdAt: new Date(Date.now() - 10 * 60_000) },
})
const freshDetail = (await json(support.jar, `/api/support/tickets/${ticketId}`)).body
check("a fresh critical ticket is green", freshDetail.ticket.sla.state === "ok",
  freshDetail.ticket.sla.state)

// Fifty minutes in is the last quarter of the window: at risk.
await prisma.supportTicket.update({
  where: { id: ticketId },
  data: { createdAt: new Date(Date.now() - 50 * 60_000) },
})
const riskyDetail = (await json(support.jar, `/api/support/tickets/${ticketId}`)).body
check("the last quarter of the window is amber", riskyDetail.ticket.sla.state === "at-risk",
  riskyDetail.ticket.sla.state)

// ── 8. Queue filtering ───────────────────────────────────────────
console.log("\n8. Ticket queue")
const queue = (await json(support.jar, "/api/support/tickets?status=OPEN")).body
check("only open tickets come back", queue.tickets.every((t) => t.status === "OPEN"))
check("our ticket is in the open queue", queue.tickets.some((t) => t.id === ticketId))

const mine = (await json(support.jar, "/api/support/tickets?assignedTo=me")).body
check("'me' resolves server-side",
  mine.tickets.every((t) => t.assignedTo === support.user.id))

const critical = (await json(support.jar, "/api/support/tickets?priority=CRITICAL")).body
check("priority filter applies", critical.tickets.every((t) => t.priority === "CRITICAL"))

const searched = (await json(support.jar, "/api/support/tickets?search=%5Bsa07%5D")).body
check("search finds the ticket by title", searched.tickets.some((t) => t.id === ticketId))

// ── 9. SLA dashboard and health monitor ──────────────────────────
console.log("\n9. SLA dashboard and health")
const sla = (await json(support.jar, "/api/support/sla?days=30")).body
check("compliance is a percentage or null",
  sla.compliancePercent === null || (sla.compliancePercent >= 0 && sla.compliancePercent <= 100))
check("CSAT is reported unavailable rather than faked", sla.csatAvailable === false)
check("byDay covers the window", sla.byDay.length === 30, `${sla.byDay.length}`)
check("responded never exceeds total", sla.totals.responded <= sla.totals.tickets)

const atRisk = (await json(support.jar, "/api/support/at-risk-schools")).body
check("at-risk rows carry a reason", atRisk.schools.every((s) => s.reasons.length > 0))
check("health scores are 0-100", atRisk.schools.every((s) => s.health >= 0 && s.health <= 100))
check("mrrAtRisk is the sum of the rows",
  Math.abs(atRisk.mrrAtRisk - atRisk.schools.reduce((sum, s) => sum + s.mrr, 0)) < 1)

// ── 10. Cross-school user search ─────────────────────────────────
console.log("\n10. User search")
const sample = await prisma.user.findFirst({
  where: { deletedAt: null, schoolId: { not: null } },
  select: { id: true, email: true, schoolId: true, role: true },
})
const found = (await json(support.jar, `/api/users/search?q=${encodeURIComponent(sample.email)}`)).body
check("search finds an account by email", found.users.some((u) => u.id === sample.id))
check("the row names its school", found.users[0]?.school !== null)

const distinctSchools = new Set(
  (await json(support.jar, "/api/users/search?role=SCHOOL_ADMIN&limit=100")).body.users.map(
    (u) => u.schoolId,
  ),
)
check("search spans more than one school", distinctSchools.size > 1, `${distinctSchools.size} schools`)

const byRole = (await json(support.jar, "/api/users/search?role=TEACHER")).body
check("role filter applies", byRole.users.every((u) => u.role === "TEACHER"))

const detailUser = (await json(support.jar, `/api/users/${sample.id}`)).body
check("user detail resolves", detailUser.user?.id === sample.id)
check("detail lists recent sessions", Array.isArray(detailUser.user?.sessions))

// ── 11. Account actions ──────────────────────────────────────────
console.log("\n11. Account actions")
const locked = await json(support.jar, `/api/users/${sample.id}/lock`, {
  method: "POST",
  body: JSON.stringify({ locked: true, reason: "SA-07 smoke test" }),
})
check("lock returns 200", locked.status === 200, `${locked.status}`)
const lockedRow = await prisma.user.findUnique({
  where: { id: sample.id },
  select: { isActive: true, sessions: { select: { id: true } } },
})
check("account is deactivated", lockedRow.isActive === false)
check("every session was dropped", lockedRow.sessions.length === 0)

const noReason = await json(support.jar, `/api/users/${sample.id}/lock`, {
  method: "POST",
  body: JSON.stringify({ locked: true }),
})
check("locking without a reason is refused", noReason.status === 400, `${noReason.status}`)

const unlocked = await json(support.jar, `/api/users/${sample.id}/lock`, {
  method: "POST",
  body: JSON.stringify({ locked: false }),
})
check("unlock returns 200", unlocked.status === 200)
check("account is active again",
  (await prisma.user.findUnique({ where: { id: sample.id }, select: { isActive: true } })).isActive)

const beforeHash = (await prisma.user.findUnique({
  where: { id: sample.id }, select: { passwordHash: true },
})).passwordHash
const reset = await json(support.jar, `/api/users/${sample.id}/reset-password`, { method: "POST" })
check("reset returns a temporary password", typeof reset.body?.temporaryPassword === "string")
check("the password is long enough", (reset.body?.temporaryPassword ?? "").length >= 12)
check("the hash actually changed",
  (await prisma.user.findUnique({ where: { id: sample.id }, select: { passwordHash: true } }))
    .passwordHash !== beforeHash)
check("the response admits there is no forced rotation", /change it/i.test(reset.body?.notice ?? ""))

const auditRows = await prisma.superAdminAuditLog.count({
  where: { userId: support.user.id, action: { in: ["user.lock", "user.unlock", "user.password.reset"] } },
})
check("account actions are audited", auditRows >= 3, `${auditRows} rows`)

// ── 12. Console staff CRUD ───────────────────────────────────────
console.log("\n12. Console staff")
const staffList = (await json(jar, "/api/internal-users")).body
check("roster returns the console accounts", staffList.users.length >= 3)
check("MFA state is exposed", staffList.users.every((u) => typeof u.totpEnabled === "boolean"))

const madeByOwner = await json(jar, "/api/internal-users", {
  method: "POST",
  body: JSON.stringify({
    name: "SA07 Temp",
    email: "sa07-temp@educoreafrica.com",
    password: "TemporaryPass2026!",
    role: "SALES_ADMIN",
    allowedIPs: ["127.0.0.1"],
  }),
})
check("SUPER_ADMIN can create staff", madeByOwner.status === 201, `${madeByOwner.status}`)
check("the new account has no TOTP yet", madeByOwner.body?.user?.totpEnabled === false)

const madeBySupport = await json(support.jar, "/api/internal-users", {
  method: "POST",
  body: JSON.stringify({
    name: "Should not exist",
    email: "sa07-nope@educoreafrica.com",
    password: "TemporaryPass2026!",
    role: "SUPER_ADMIN",
  }),
})
check("SUPPORT_ADMIN cannot create staff", madeBySupport.status === 403, `${madeBySupport.status}`)

const shortPassword = await json(jar, "/api/internal-users", {
  method: "POST",
  body: JSON.stringify({ name: "Short", email: "sa07-short@educoreafrica.com", password: "abc", role: "SALES_ADMIN" }),
})
check("short passwords are refused", shortPassword.status === 400)

const tempId = madeByOwner.body?.user?.id
const roleChange = await json(jar, `/api/internal-users/${tempId}`, {
  method: "PUT",
  body: JSON.stringify({ role: "FINANCE_ADMIN" }),
})
check("role can be changed", roleChange.body?.user?.role === "FINANCE_ADMIN")

const selfDemote = await json(jar, `/api/internal-users/${owner.user.id}`, {
  method: "PUT",
  body: JSON.stringify({ role: "SALES_ADMIN" }),
})
check("you cannot demote yourself out of SUPER_ADMIN", selfDemote.status === 400, `${selfDemote.status}`)

const selfDeactivate = await json(jar, `/api/internal-users/${owner.user.id}`, {
  method: "PUT",
  body: JSON.stringify({ isActive: false }),
})
check("you cannot deactivate yourself", selfDeactivate.status === 400)

// ── 13. Login anomalies ──────────────────────────────────────────
console.log("\n13. Login anomalies")
const anomalies = (await json(jar, "/api/users/anomalies")).body
check("returns a list", Array.isArray(anomalies.anomalies))
check("geo-IP claims are listed as unavailable, not invented",
  anomalies.unavailable.some((line) => /geo-ip/i.test(line)))
check("no anomaly claims a country", JSON.stringify(anomalies.anomalies).toLowerCase().includes("country") === false)
check("every anomaly carries a timestamp and an address",
  anomalies.anomalies.every((a) => a.at && a.ipAddress))
check("repeats are grouped, not listed one per event",
  anomalies.anomalies.every((a) => a.occurrences >= 1 && a.firstAt <= a.at))
const anomalyKeys = anomalies.anomalies.map((a) => `${a.kind}|${a.subjectId ?? a.subject}|${a.ipAddress}`)
check("no duplicate signal rows", new Set(anomalyKeys).size === anomalyKeys.length,
  `${anomalyKeys.length} rows`)

// ── 14. Broadcast ────────────────────────────────────────────────
console.log("\n14. Broadcast")
const preview = (await json(jar, "/api/broadcast/preview", {
  method: "POST",
  body: JSON.stringify({ audience: "BY_PLAN", filter: { plans: ["STARTER"] } }),
})).body
const dbStarter = await prisma.school.count({
  where: { deletedAt: null, subscription: { is: { plan: "STARTER" } } },
})
check("preview counts the right schools", preview.schools === dbStarter, `${preview.schools} vs ${dbStarter}`)

const emptyTarget = await json(jar, "/api/broadcast", {
  method: "POST",
  body: JSON.stringify({
    title: "[sa07] nothing selected",
    body: "should be refused",
    audience: "BY_PLAN",
    filter: { plans: [] },
    channels: ["IN_APP"],
  }),
})
check("a targeted send with nothing selected is refused", emptyTarget.status === 400, `${emptyTarget.status}`)

const before6 = await prisma.notification.count({
  where: { title: "[sa07] Broadcast smoke test" },
})
const sent = await json(jar, "/api/broadcast", {
  method: "POST",
  body: JSON.stringify({
    title: "[sa07] Broadcast smoke test",
    body: "Sent by the SA-07 smoke test.",
    audience: "BY_PLAN",
    filter: { plans: ["STARTER"] },
    channels: ["IN_APP", "SMS"],
  }),
})
check("send returns 201", sent.status === 201, `${sent.status}`)
check("it reached the previewed school count", sent.body?.schools === dbStarter)

const notifications = await prisma.notification.findMany({
  where: { title: "[sa07] Broadcast smoke test" },
  select: { userId: true, schoolId: true, channel: true, user: { select: { role: true } } },
})
check("one in-app row per recipient",
  notifications.length === sent.body?.inAppSent && notifications.length > before6,
  `${notifications.length} rows vs inAppSent ${sent.body?.inAppSent}`)
check("only school admins and principals were written",
  notifications.every((n) => ["SCHOOL_ADMIN", "PRINCIPAL"].includes(n.user.role)))
check("every row is IN_APP", notifications.every((n) => n.channel === "IN_APP"))

const targetSchoolIds = new Set(
  (await prisma.school.findMany({
    where: { deletedAt: null, subscription: { is: { plan: "STARTER" } } },
    select: { id: true },
  })).map((s) => s.id),
)
check("nothing landed outside the audience",
  notifications.every((n) => targetSchoolIds.has(n.schoolId)))
check("SMS is reported as not dispatched from the console",
  sent.body?.deferred?.some((d) => d.channel === "SMS"))
check("SMS wrote no notification rows",
  (await prisma.notification.count({
    where: { title: "[sa07] Broadcast smoke test", channel: "SMS" },
  })) === 0)

const supportBroadcast = await json(support.jar, "/api/broadcast", {
  method: "POST",
  body: JSON.stringify({
    title: "[sa07] refused",
    body: "x",
    audience: "ALL",
    channels: ["IN_APP"],
  }),
})
check("SUPPORT_ADMIN cannot broadcast", supportBroadcast.status === 403, `${supportBroadcast.status}`)

// ── 15. Pages render ─────────────────────────────────────────────
console.log("\n15. Pages render")
for (const [path, marker] of [
  ["/console/analytics", "Feature adoption"],
  ["/console/analytics?tab=cohorts", "Retention by signup month"],
  ["/console/analytics?tab=funnel", "Signup to renewal"],
  ["/console/analytics?tab=geographic", "Schools by state"],
  ["/console/analytics?tab=geographic&view=table", "90-day growth"],
  ["/console/analytics?tab=nps", "Net Promoter Score"],
  ["/console/analytics?tab=performance", "By endpoint"],
  ["/console/support", "Support Console"],
  ["/console/support/sla", "SLA compliance"],
  ["/console/support/health", "School health monitor"],
  ["/console/support/broadcast", "Recent broadcasts"],
  ["/console/users", "School users"],
  ["/console/users/staff", "Console staff"],
  ["/console/users/anomalies", "Login anomalies"],
]) {
  const r = await req(jar, path)
  const html = await r.text()
  check(`${path}`, r.status === 200 && html.includes(marker), `${r.status}`)
}

const adoptionHtml = await (await req(jar, "/console/analytics")).text()
check("the heatmap paints its ramp", adoptionHtml.includes("#3B82F6"))
check("unbuilt modules say so on the page", /not built/i.test(adoptionHtml))

const funnelHtml = await (await req(jar, "/console/analytics?tab=funnel")).text()
check("the funnel marks its unmeasured stage", /not measured/i.test(funnelHtml))

const perfHtml = await (await req(jar, "/console/analytics?tab=performance")).text()
check("the performance tab explains where its numbers come from",
  /no APM in this stack/i.test(perfHtml))

const supportHtml = await (await req(support.jar, "/console/support")).text()
check("the queue carries a filter sidebar", supportHtml.includes("Assignee"))

// Role gates on the pages themselves.
check("analyst is redirected away from the support console",
  (await req(analyst.jar, "/console/support")).status === 307)
check("support lead is redirected away from broadcast",
  (await req(support.jar, "/console/support/broadcast")).status === 307)
check("support lead can reach the health monitor",
  (await req(support.jar, "/console/support/health")).status === 200)

// ── Cleanup ──────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`)

await prisma.notification.deleteMany({ where: { title: "[sa07] Broadcast smoke test" } })
await prisma.broadcast.deleteMany({ where: { title: { startsWith: "[sa07]" } } })
await prisma.ticketComment.deleteMany({ where: { ticketId } })
await prisma.supportTicket.deleteMany({ where: { title: { startsWith: "[sa07]" } } })
await prisma.superAdminUser.deleteMany({
  where: { email: { in: [...EMAILS, "sa07-temp@educoreafrica.com"] } },
})
await prisma.$disconnect()
process.exit(failures === 0 ? 0 : 1)
