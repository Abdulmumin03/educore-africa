// SA-05 check: metrics, Command Centre, directory and impersonation.
//
//   pnpm --filter superadmin dev            # in one terminal
//   pnpm --filter superadmin test:sa05      # in another
//
// Needs a RUNNING SERVER, a real database and demo data (`pnpm seed:demo`).
// Creates and deletes its own throwaway console account.
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import * as OTPAuth from "otpauth"

const BASE = "http://localhost:3001"
const EMAIL = "sa-sa05@educoreafrica.com"
const PASSWORD = "Sa05Check!2026"
const prisma = new PrismaClient()
const jar = new Map()

let failures = 0
const check = (name, ok, extra = "") => {
  if (!ok) failures++
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${extra ? ` — ${extra}` : ""}`)
}

const header = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
function absorb(r) {
  for (const raw of r.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";")
    const i = pair.indexOf("=")
    const n = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim()
    v === "" ? jar.delete(n) : jar.set(n, v)
  }
}
async function go(path, init = {}) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: {
      "x-forwarded-for": "127.0.0.1",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
      ...(header() ? { cookie: header() } : {}),
    },
    redirect: "manual",
  })
  absorb(r)
  return r
}
const json = async (path, init) => {
  const r = await go(path, init)
  let body = null
  try { body = await r.json() } catch {}
  return { status: r.status, body }
}

await prisma.superAdminUser.deleteMany({ where: { email: EMAIL } })
const admin = await prisma.superAdminUser.create({
  data: { email: EMAIL, name: "SA05 Checker", role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(PASSWORD, 10) },
})

// Sign in (password -> enrol TOTP -> session).
await go("/api/auth/signin", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
const enroll = (await json("/api/auth/totp/enroll", { method: "POST" })).body
const totp = new OTPAuth.TOTP({
  issuer: "EduCore Africa Console", label: EMAIL,
  algorithm: "SHA1", digits: 6, period: 30,
  secret: OTPAuth.Secret.fromBase32(enroll.secret),
})
for (let attempt = 0; attempt < 4; attempt++) {
  // A code generated just before a window boundary is stale by the time it
  // lands, so retry across windows rather than make every run a coin flip.
  const confirmed = await go("/api/auth/totp/confirm", {
    method: "POST",
    body: JSON.stringify({ code: totp.generate() }),
  })
  if (confirmed.status === 200) break
  await new Promise((resolve) => setTimeout(resolve, 2500))
}
check("signed in", jar.has("educore-sa.session-token"))

// ── 1. Metrics service ───────────────────────────────────────────
console.log("\n1. Metrics service")
const overview = (await json("/api/metrics/overview?refresh=1")).body
const dbSchools = await prisma.school.count({ where: { deletedAt: null } })
const dbStudents = await prisma.student.count({ where: { deletedAt: null } })
check("total schools matches the database", overview.totalSchools === dbSchools, `${overview.totalSchools} vs ${dbSchools}`)
check("total students matches", overview.totalStudents === dbStudents, `${overview.totalStudents} vs ${dbStudents}`)
check("active <= total", overview.activeSchools <= overview.totalSchools, `${overview.activeSchools}/${overview.totalSchools}`)

// MRR must equal the monthly-equivalent sum, not the raw amounts.
const subs = await prisma.schoolSubscription.findMany({
  where: { status: { in: ["ACTIVE", "PAST_DUE"] } },
  select: { amount: true, cycle: true },
})
const expectedMrr = subs.reduce((sum, s) => {
  const a = Number(s.amount)
  return sum + (s.cycle === "MONTHLY" ? a : s.cycle === "TERMLY" ? a / 3 : a / 12)
}, 0)
check("MRR normalises billing cycles", Math.abs(overview.mrr - expectedMrr) < 1,
  `api ${Math.round(overview.mrr)} vs computed ${Math.round(expectedMrr)}`)
check("ARR is 12x MRR", Math.abs(overview.arr - overview.mrr * 12) < 1)
const rawSum = subs.reduce((s, r) => s + Number(r.amount), 0)
check("MRR is NOT the raw amount sum", Math.abs(overview.mrr - rawSum) > 1, `raw would be ${Math.round(rawSum)}`)
check("trial count matches", overview.trialSchools === (await prisma.schoolSubscription.count({ where: { status: "TRIAL" } })))

const snapshot = await prisma.platformMetricSnapshot.findFirst({ orderBy: { snapshotDate: "desc" } })
check("wrote a PlatformMetricSnapshot", snapshot !== null && snapshot.totalSchools === dbSchools)

const cached = (await json("/api/metrics/overview")).body
check("cached read returns the same figures", cached.mrr === overview.mrr)

// ── 2. Chart endpoints ───────────────────────────────────────────
console.log("\n2. Chart data")
const growth = (await json("/api/metrics/growth-trend")).body
check("growth trend has 12 months", growth.months.length === 12, `${growth.months.length}`)
check("months carry signups and churn", growth.months.every((m) => typeof m.signups === "number" && typeof m.churned === "number"))
check("some signups exist", growth.months.some((m) => m.signups > 0))

const mix = (await json("/api/metrics/subscription-mix")).body
check("mix covers 5 plans", mix.plans.length === 5, `${mix.plans.length}`)
const mixSchools = mix.plans.reduce((s, p) => s + p.schools, 0)
check("plan school counts sum to the total", mixSchools === mix.totalSchools, `${mixSchools} vs ${mix.totalSchools}`)
const mixMrr = mix.plans.reduce((s, p) => s + p.mrr, 0)
check("plan MRR sums to platform MRR", Math.abs(mixMrr - overview.mrr) < 1)

const byState = (await json("/api/metrics/by-state")).body
check("state breakdown returned", byState.states.length > 0, `${byState.states.length} states`)
check("state school counts sum to the total", byState.totalSchools === dbSchools, `${byState.totalSchools} vs ${dbSchools}`)
check("states sorted by school count", byState.states.every((s, i, a) => i === 0 || a[i - 1].schools >= s.schools))

const alerts = (await json("/api/alerts")).body
check("alerts returned", Array.isArray(alerts.alerts), `${alerts.alerts.length} alerts`)
check("alerts carry severity and link", alerts.alerts.every((a) => a.severity && a.link && a.message))

// ── 3. AI snapshot ───────────────────────────────────────────────
console.log("\n3. AI business snapshot")
const ai = (await json("/api/ai/business-snapshot?refresh=1")).body
check("snapshot generated", typeof ai.text === "string" && ai.text.length > 200, `${ai.text?.length ?? 0} chars, source=${ai.source}`)
check("three paragraphs", ai.text.split(/\n\s*\n/).length >= 3, `${ai.text.split(/\n\s*\n/).length}`)
check("built from live metrics", ai.basedOn.schools === dbSchools, `${ai.basedOn.schools}`)
const aiCached = (await json("/api/ai/business-snapshot")).body
check("second call is cached", aiCached.cached === true)

// ── 4. Command Centre page ───────────────────────────────────────
console.log("\n4. Command Centre renders all five rows")
const home = await (await go("/console")).text()
check("row 1 — KPI cards", home.includes("Active schools") && home.includes("ARR") && home.includes("Platform uptime"))
check("row 2 — growth + mix", home.includes("Monthly growth") && home.includes("Subscription mix"))
check("row 3 — choropleth + revenue", home.includes("Schools by state") && home.includes("Revenue by plan"))
check("row 4 — alerts + activity", home.includes("Action required") && home.includes("Live activity"))
check("row 5 — AI snapshot", home.includes("EduCore Intelligence"))
check("choropleth has state tiles", home.includes(">LAG<") && home.includes(">KAN<"))
check("MRR rendered as naira", /₦[\d,]+/.test(home))

// ── 5. Directory ─────────────────────────────────────────────────
console.log("\n5. School directory")
const page1 = (await json("/api/schools?page=1&limit=25")).body
check("server pagination caps the page", page1.rows.length <= 25, `${page1.rows.length}`)
check("total matches the database", page1.total === dbSchools, `${page1.total} vs ${dbSchools}`)
check("rows carry plan, status, MRR and health", page1.rows.every((r) => "plan" in r && "status" in r && typeof r.mrr === "number" && typeof r.health === "number"))
check("health scores are 0-100", page1.rows.every((r) => r.health >= 0 && r.health <= 100))
check("status counts provided", typeof page1.counts.ACTIVE === "number" && page1.counts.ALL === dbSchools)

const page2 = (await json("/api/schools?page=2&limit=25")).body
check("page 2 differs from page 1", page2.rows[0]?.id !== page1.rows[0]?.id)

const sample = await prisma.school.findFirst({ where: { slug: { startsWith: "demo-" } }, select: { id: true, name: true, state: true } })
const searched = (await json(`/api/schools?search=${encodeURIComponent(sample.name.slice(0, 8))}`)).body
check("search filters", searched.rows.length > 0 && searched.rows.every((r) => r.name.toLowerCase().includes(sample.name.slice(0, 8).toLowerCase()) || r.slug.includes("demo")), `${searched.total} hits`)

const lagos = (await json("/api/schools?state=Lagos")).body
check("state filter", lagos.rows.every((r) => r.state === "Lagos"), `${lagos.total} in Lagos`)

const trials = (await json("/api/schools?status=TRIAL")).body
check("status filter", trials.rows.every((r) => r.status === "TRIAL"), `${trials.total} on trial`)

const starter = (await json("/api/schools?plan=STARTER")).body
check("plan filter", starter.rows.every((r) => r.plan === "STARTER"), `${starter.total} on Starter`)

const csv = await go("/api/schools/export?status=ACTIVE")
const csvText = await csv.text()
check("CSV export", csv.status === 200 && csvText.split("\n").length > 2 && csvText.includes("Health score"))

const listPage = await (await go("/console/schools?status=TRIAL")).text()
check("directory page renders with filters", listPage.includes("Schools") && listPage.includes("Trial"))

// ── 6. School profile tabs ───────────────────────────────────────
console.log("\n6. School profile")
const detail = (await json(`/api/schools/${sample.id}`)).body
check("detail returns the school", detail.school.id === sample.id)
check("adoption covers 8 modules", detail.adoption.length === 8, `${detail.adoption.length}`)
for (const tab of ["overview", "subscription", "usage", "financials", "users", "support", "activity"]) {
  const html = await (await go(`/console/schools/${sample.id}?tab=${tab}`)).text()
  const ok = html.includes(sample.name) && !html.includes("Application error")
  check(`${tab} tab renders`, ok)
}

// ── 7. Subscription + notes writes ───────────────────────────────
console.log("\n7. Mutations")
const before = await prisma.schoolSubscription.findUnique({ where: { schoolId: sample.id } })
const upd = await json(`/api/schools/${sample.id}/subscription`, {
  method: "PUT",
  body: JSON.stringify({ plan: "ENTERPRISE", cycle: "TERMLY", amount: 900000, promoCode: "SMOKE10", promoPercent: 10 }),
})
check("plan change accepted", upd.status === 200, `${upd.status}`)
const after = await prisma.schoolSubscription.findUnique({ where: { schoolId: sample.id } })
check("plan persisted", after.plan === "ENTERPRISE" && Number(after.amount) === 900000)
check("promo persisted", after.promoCode === "SMOKE10" && after.promoPercent === 10)
check("change audited", (await prisma.superAdminAuditLog.count({
  where: { action: "school.subscription.update", target: `school:${sample.id}` } })) >= 1)

const note = await json(`/api/schools/${sample.id}/notes`, {
  method: "POST", body: JSON.stringify({ body: "Smoke-test note", category: "SALES" }),
})
check("CRM note created", note.status === 201 && note.body.note.author?.name === "SA05 Checker")

const statusChange = await json(`/api/schools/${sample.id}/status`, {
  method: "PUT", body: JSON.stringify({ status: "SUSPENDED", reason: "smoke test" }),
})
check("status change accepted", statusChange.status === 200)
const suspended = await prisma.school.findUnique({ where: { id: sample.id }, select: { isActive: true } })
check("School.isActive follows the subscription", suspended.isActive === false)

// ── 8. Impersonation ─────────────────────────────────────────────
console.log("\n8. Impersonation")
const imp = await json(`/api/schools/${sample.id}/impersonate`, {
  method: "POST", body: JSON.stringify({ reason: "smoke test" }),
})
check("grant minted", imp.status === 200 && typeof imp.body.impersonationToken === "string", `${imp.status}`)
check("redirect points at the school app", imp.body.redirectUrl?.includes("/api/impersonation/accept?token="))
const grant = await prisma.impersonationGrant.findUnique({ where: { id: imp.body.grantId } })
check("only the hash is stored", grant && !JSON.stringify(grant).includes(imp.body.impersonationToken))
const ttl = Math.round((new Date(imp.body.expiresAt) - Date.now()) / 60000)
check("expires in ~60 minutes", ttl >= 58 && ttl <= 60, `${ttl} min`)
check("IMPERSONATION_START audited", (await prisma.superAdminAuditLog.count({
  where: { action: "IMPERSONATION_START", target: `school:${sample.id}` } })) >= 1)

const ended = await json("/api/impersonation/end", { method: "POST", body: JSON.stringify({ grantId: imp.body.grantId }) })
check("session ended", ended.status === 200 && ended.body.ok === true)
check("IMPERSONATION_END audited", (await prisma.superAdminAuditLog.count({
  where: { action: "IMPERSONATION_END", target: `school:${sample.id}` } })) >= 1)
const endedGrant = await prisma.impersonationGrant.findUnique({ where: { id: imp.body.grantId } })
check("grant marked ended", endedGrant.endedAt !== null)

// Restore what the mutation checks changed.
//
// The plan change wrote a SubscriptionRevision, as it should. Rolling the row
// back with raw Prisma does not undo that, and an orphaned revision makes the
// revenue chart's latest point disagree with the MRR card — which is exactly
// the kind of thing SA-06 checks for. Delete the revisions this run created.
await prisma.subscriptionRevision.deleteMany({ where: { actorId: admin.id } })
await prisma.schoolSubscription.update({
  where: { schoolId: sample.id },
  data: { plan: before.plan, amount: before.amount, cycle: before.cycle, status: before.status, promoCode: before.promoCode, promoPercent: before.promoPercent },
})
await prisma.school.update({ where: { id: sample.id }, data: { isActive: true } })

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`)
await prisma.superAdminUser.deleteMany({ where: { email: EMAIL } })
await prisma.$disconnect()
process.exit(failures === 0 ? 0 : 1)
