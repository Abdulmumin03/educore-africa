// SA-06 check: revenue intelligence, transactions, dunning, refunds, cohorts.
//
//   pnpm --filter superadmin dev          # in one terminal
//   pnpm --filter superadmin test:sa06    # in another
//
// Needs a RUNNING SERVER, a real database and demo data (`pnpm seed:demo`).
// Creates and deletes its own throwaway console accounts.
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

/** Sign a fresh console account in end to end and return its cookie jar. */
async function signIn(email, role) {
  const password = "Sa06Check!2026"
  await prisma.superAdminUser.deleteMany({ where: { email } })
  const user = await prisma.superAdminUser.create({
    data: { email, name: `SA06 ${role}`, role, passwordHash: await bcrypt.hash(password, 10) },
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

const finance = await signIn("sa06-finance@educoreafrica.com", "FINANCE_ADMIN")
const analyst = await signIn("sa06-analyst@educoreafrica.com", "ANALYTICS_ADMIN")
check("finance session", finance.jar.has("educore-sa.session-token"))
check("analyst session", analyst.jar.has("educore-sa.session-token"))
const jar = finance.jar

// ── 1. KPIs ──────────────────────────────────────────────────────
console.log("\n1. Revenue KPIs")
const kpis = (await json(jar, "/api/revenue/kpis?preset=12m")).body
const subs = await prisma.schoolSubscription.findMany({
  where: { status: { in: ["ACTIVE", "PAST_DUE"] } },
  select: { amount: true, cycle: true },
})
const expectedMrr = subs.reduce((sum, s) => {
  const a = Number(s.amount)
  return sum + (s.cycle === "MONTHLY" ? a : s.cycle === "TERMLY" ? a / 3 : a / 12)
}, 0)
check("MRR matches normalised sum", Math.abs(kpis.mrr - expectedMrr) < 1, `${Math.round(kpis.mrr)} vs ${Math.round(expectedMrr)}`)
check("ARR is 12x MRR", Math.abs(kpis.arr - kpis.mrr * 12) < 1)
check("avg per school = MRR / paying", Math.abs(kpis.avgPerSchool - kpis.mrr / kpis.payingSchools) < 1)

const settled = await prisma.subscriptionTransaction.aggregate({
  where: { status: { in: ["SUCCESSFUL", "PARTIALLY_REFUNDED"] }, paidAt: { gte: new Date(kpis.range.from), lte: new Date(kpis.range.to) } },
  _sum: { amount: true },
})
check("period revenue matches settled charges",
  Math.abs(kpis.periodRevenue - Number(settled._sum.amount ?? 0)) < 1,
  `${Math.round(kpis.periodRevenue)}`)
check("NRR present with a breakdown", kpis.nrr !== null && kpis.nrrBreakdown !== null, `${kpis.nrr?.toFixed(1)}%`)
if (kpis.nrrBreakdown) {
  const b = kpis.nrrBreakdown
  check("NRR = retained / starting",
    Math.abs(kpis.nrr - (b.retainedMrr / b.startingMrr) * 100) < 0.01)
  check("expansion and contraction are separated", b.expansion >= 0 && b.contraction >= 0 && b.churned >= 0,
    `+${Math.round(b.expansion)} / -${Math.round(b.contraction)} / churn -${Math.round(b.churned)}`)
}

// Range presets must actually change the window.
const mtd = (await json(jar, "/api/revenue/kpis?preset=mtd")).body
const ytd = (await json(jar, "/api/revenue/kpis?preset=ytd")).body
check("presets produce different ranges", mtd.range.from !== ytd.range.from, `${mtd.range.from.slice(0, 10)} vs ${ytd.range.from.slice(0, 10)}`)
const custom = (await json(jar, "/api/revenue/kpis?preset=custom&from=2026-01-01&to=2026-03-31")).body
check("custom range honoured", custom.range.from.startsWith("2026-01-01") && custom.range.to.startsWith("2026-03-31"))

// ── 2. Stacked area ──────────────────────────────────────────────
console.log("\n2. Revenue by period")
const period = (await json(jar, "/api/revenue/by-period?preset=12m&granularity=monthly")).body
check("12 monthly points", period.points.length === 12, `${period.points.length}`)
check("5 plan series", period.plans.length === 5)
const last = period.points.at(-1)
const stackSum = period.plans.reduce((sum, plan) => sum + Number(last[plan] ?? 0), 0)
check("plan values stack to the point total", Math.abs(stackSum - last.total) < 1, `${Math.round(stackSum)} vs ${Math.round(last.total)}`)
check("latest point tracks current MRR", Math.abs(last.total - kpis.mrr) < 1, `${Math.round(last.total)}`)
check("series is non-empty", period.points.some((p) => p.total > 0))

const weekly = (await json(jar, "/api/revenue/by-period?preset=mtd&granularity=weekly")).body
check("weekly granularity works", weekly.granularity === "weekly" && weekly.points.length > 0, `${weekly.points.length} points`)

// ── 3. By state + churn ──────────────────────────────────────────
console.log("\n3. States and churn")
const states = (await json(jar, "/api/revenue/by-state?limit=10")).body
check("top 10 states", states.rows.length <= 10 && states.rows.length > 0, `${states.rows.length} of ${states.totalStates}`)
check("sorted by MRR desc", states.rows.every((r, i, a) => i === 0 || a[i - 1].mrr >= r.mrr))
check("shown MRR <= total", states.shownMrr <= states.totalMrr + 1)

const churn = (await json(jar, "/api/revenue/churn?preset=12m")).body
check("churn months returned", churn.months.length >= 12, `${churn.months.length}`)
check("months carry count and rate", churn.months.every((m) => typeof m.churned === "number" && typeof m.rate === "number"))
const dbChurned = await prisma.schoolSubscription.count({ where: { status: "CHURNED" } })
check("recent churns listed", Array.isArray(churn.recent), `${churn.recent.length} of ${dbChurned} churned`)
check("churn rows carry LTV", churn.recent.every((r) => typeof r.ltv === "number" && r.ltv >= 0))

// ── 4. Transactions ──────────────────────────────────────────────
console.log("\n4. Transaction log")
const txns = (await json(jar, "/api/revenue/transactions?page=1&limit=25")).body
const dbTxns = await prisma.subscriptionTransaction.count()
check("total matches the database", txns.total === dbTxns, `${txns.total} vs ${dbTxns}`)
check("page capped at 25", txns.rows.length <= 25)
check("rows carry gateway, status and ref", txns.rows.every((r) => r.gateway && r.status && r.reference))

const failedOnly = (await json(jar, "/api/revenue/transactions?status=FAILED")).body
check("status filter", failedOnly.rows.every((r) => r.status === "FAILED"), `${failedOnly.total} failed`)
const paystack = (await json(jar, "/api/revenue/transactions?gateway=PAYSTACK")).body
check("gateway filter", paystack.rows.every((r) => r.gateway === "PAYSTACK"), `${paystack.total} via Paystack`)
const sample = txns.rows[0]
const searched = (await json(jar, `/api/revenue/transactions?search=${encodeURIComponent(sample.reference)}`)).body
check("reference search", searched.total >= 1 && searched.rows[0].reference === sample.reference)

const xlsx = await req(jar, "/api/revenue/transactions/export?status=SUCCESSFUL")
const buf = Buffer.from(await xlsx.arrayBuffer())
check("Excel export", xlsx.status === 200 && buf.length > 1000 && buf.subarray(0, 2).toString() === "PK",
  `${buf.length} bytes, ${xlsx.headers.get("content-type")?.slice(0, 40)}`)

// ── 5. Failed payments + dunning ─────────────────────────────────
console.log("\n5. Failed payments")
const failed = (await json(jar, "/api/revenue/failed-payments")).body
const dbFailed = await prisma.subscriptionTransaction.count({ where: { status: "FAILED", resolvedAt: null } })
check("count matches", failed.items.length === dbFailed, `${failed.items.length} vs ${dbFailed}`)
check("summary stats present", typeof failed.totalOutstanding === "number" && typeof failed.avgDaysOverdue === "number",
  `${Math.round(failed.totalOutstanding)} across ${failed.schoolCount} schools`)
check("rows carry reason, attempts and overdue days",
  failed.items.every((i) => i.failureReason && typeof i.attempts === "number" && typeof i.daysOverdue === "number"))
check("sorted oldest first", failed.items.every((i, n, a) => n === 0 || a[n - 1].daysOverdue >= i.daysOverdue))

const target = failed.items[0]
if (target) {
  const before = await prisma.subscriptionTransaction.findUnique({ where: { id: target.id }, select: { remindersSent: true } })
  const reminder = await json(jar, `/api/revenue/failed-payments/${target.id}/send-reminder`, { method: "POST", body: "{}" })
  check("reminder queued", reminder.status === 200 && reminder.body.ok === true, `${reminder.status}`)
  check("reminder is in-app only, and says so",
    reminder.body.channels.sms === 0 && reminder.body.channels.email === 0 && typeof reminder.body.note === "string")
  const after = await prisma.subscriptionTransaction.findUnique({ where: { id: target.id }, select: { remindersSent: true, lastReminderAt: true } })
  check("reminder counter incremented", after.remindersSent === before.remindersSent + 1 && after.lastReminderAt !== null)
  check("reminder audited", (await prisma.superAdminAuditLog.count({ where: { action: "revenue.reminder.send" } })) >= 1)

  const retry = await json(jar, `/api/revenue/failed-payments/${target.id}/retry`, { method: "POST", body: "{}" })
  check("retry accepted", retry.status === 200, `${retry.status}`)
  check("retry does NOT claim a charge was made", retry.body.queuedOnly === true && /no card was charged/i.test(retry.body.note))
  const retried = await prisma.subscriptionTransaction.findUnique({ where: { id: target.id }, select: { status: true, attempts: true } })
  check("moved to PENDING with an extra attempt", retried.status === "PENDING" && retried.attempts === target.attempts + 1)

  // Put it back so re-runs behave the same.
  await prisma.subscriptionTransaction.update({
    where: { id: target.id },
    data: { status: "FAILED", attempts: target.attempts, remindersSent: before.remindersSent, resolvedAt: null },
  })
}

// ── 6. Refunds and the role gate ─────────────────────────────────
console.log("\n6. Refunds")
const settledTxn = await prisma.subscriptionTransaction.findFirst({
  where: { status: "SUCCESSFUL" },
  select: { id: true, amount: true, schoolId: true, status: true },
})

const denied = await json(analyst.jar, "/api/revenue/refunds", {
  method: "POST",
  body: JSON.stringify({ transactionId: settledTxn.id, amount: 100, reason: "GOODWILL" }),
})
check("ANALYTICS_ADMIN is refused", denied.status === 403, `${denied.status}`)
check("no refund was written for the refused call",
  (await prisma.subscriptionRefund.count({ where: { transactionId: settledTxn.id } })) === 0)

const half = Math.round(Number(settledTxn.amount) / 2)
const partial = await json(jar, "/api/revenue/refunds", {
  method: "POST",
  body: JSON.stringify({ transactionId: settledTxn.id, amount: half, reason: "ERROR", note: "smoke test" }),
})
check("FINANCE_ADMIN may refund", partial.status === 201, `${partial.status}`)
check("partial refund flips the charge", partial.body.transactionStatus === "PARTIALLY_REFUNDED")
check("gateway NOT called without REFUNDS_LIVE",
  partial.body.refund.gatewaySent === false && typeof partial.body.gatewayNote === "string",
  partial.body.gatewayNote)

const over = await json(jar, "/api/revenue/refunds", {
  method: "POST",
  body: JSON.stringify({ transactionId: settledTxn.id, amount: Number(settledTxn.amount), reason: "REQUEST" }),
})
check("cannot over-refund", over.status === 409, `${over.status}`)

const rest = await json(jar, "/api/revenue/refunds", {
  method: "POST",
  body: JSON.stringify({ transactionId: settledTxn.id, amount: Number(settledTxn.amount) - half, reason: "REQUEST" }),
})
check("remainder refundable", rest.status === 201 && rest.body.transactionStatus === "REFUNDED", `${rest.status}`)
check("refund audited with the approver",
  (await prisma.superAdminAuditLog.count({ where: { action: "revenue.refund.approve" } })) >= 2)

const log = (await json(jar, "/api/revenue/refunds")).body
check("refund log lists them", log.refunds.length >= 2)
check("log names the approver", log.refunds.some((r) => r.approvedBy === "SA06 FINANCE_ADMIN"))

// Restore.
await prisma.subscriptionRefund.deleteMany({ where: { transactionId: settledTxn.id } })
await prisma.subscriptionTransaction.update({ where: { id: settledTxn.id }, data: { status: "SUCCESSFUL" } })

// ── 7. AI forecast ───────────────────────────────────────────────
console.log("\n7. AI revenue forecast")
const forecast = (await json(jar, "/api/ai/revenue-forecast?refresh=1", { method: "POST" })).body
check("three months returned",
  forecast.forecast.month1 && forecast.forecast.month2 && forecast.forecast.month3)
for (const key of ["month1", "month2", "month3"]) {
  const scenario = forecast.forecast[key]
  check(`${key} has three scenarios`,
    typeof scenario.base === "number" && typeof scenario.optimistic === "number" && typeof scenario.pessimistic === "number")
  check(`${key} scenarios are ordered`, scenario.pessimistic <= scenario.base && scenario.base <= scenario.optimistic,
    `${Math.round(scenario.pessimistic)} <= ${Math.round(scenario.base)} <= ${Math.round(scenario.optimistic)}`)
}
check("assumptions and risks listed",
  forecast.forecast.assumptions.length > 0 && forecast.forecast.risks.length > 0)
check("inputs come from live metrics", Math.abs(forecast.inputs.mrr - kpis.mrr) < 2, `${forecast.inputs.mrr}`)
const cachedForecast = (await json(jar, "/api/ai/revenue-forecast", { method: "POST" })).body
check("cached on the second call", cachedForecast.cached === true)

// ── 8. Cohorts ───────────────────────────────────────────────────
console.log("\n8. Cohort retention")
const cohorts = (await json(jar, "/api/revenue/cohorts?months=12")).body
check("12 cohorts", cohorts.cohorts.length === 12, `${cohorts.cohorts.length}`)
const populated = cohorts.cohorts.filter((c) => c.size > 0)
check("some cohorts have members", populated.length > 0, `${populated.length} populated`)
check("month 0 is always 100%", populated.every((c) => c.retention[0] === null || c.retention[0] === 100))
check("retention never rises over time",
  populated.every((c) => {
    const seen = c.retention.filter((v) => v !== null)
    return seen.every((v, i) => i === 0 || seen[i - 1] >= v - 0.001)
  }))
check("future periods are null",
  cohorts.cohorts.at(-1).retention.slice(1).every((v) => v === null))
check("values are percentages", populated.every((c) => c.retention.every((v) => v === null || (v >= 0 && v <= 100))))

// ── 9. Pages ─────────────────────────────────────────────────────
console.log("\n9. Pages render")
for (const [path, marker] of [
  ["/console/revenue", "Revenue Intelligence"],
  ["/console/revenue?preset=ytd", "Revenue by plan tier"],
  ["/console/revenue/transactions", "Transactions"],
  ["/console/revenue/failed-payments", "Total outstanding"],
  ["/console/revenue/refunds", "Refunds"],
  ["/console/revenue/cohorts", "Cohort retention"],
]) {
  const r = await req(jar, path)
  const html = await r.text()
  check(`${path}`, r.status === 200 && html.includes(marker), `${r.status}`)
}

const dash = await (await req(jar, "/console/revenue")).text()
check("dashboard shows naira amounts", /₦[\d,]+/.test(dash))
check("dashboard carries the forecast panel", dash.includes("3-month revenue forecast"))
check("cohort grid colour-codes cells", (await (await req(jar, "/console/revenue/cohorts")).text()).includes("#3B82F6"))

// Analyst may read the dashboard but not the refunds screen actions.
const analystDash = await req(analyst.jar, "/console/revenue")
check("analyst can read the dashboard", analystDash.status === 200)
const analystRefunds = await req(analyst.jar, "/console/revenue/refunds")
check("analyst is redirected away from refunds", analystRefunds.status === 307, `${analystRefunds.status}`)

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`)
await prisma.superAdminUser.deleteMany({
  where: { email: { in: ["sa06-finance@educoreafrica.com", "sa06-analyst@educoreafrica.com"] } },
})
await prisma.$disconnect()
process.exit(failures === 0 ? 0 : 1)
