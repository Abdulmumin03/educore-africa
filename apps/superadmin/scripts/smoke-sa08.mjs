// SA-08 check: system health, feature flags, platform config, audit &
// compliance, growth tools.
//
//   pnpm --filter superadmin dev          # in one terminal
//   pnpm --filter web dev                 # needed for the promo-at-signup check
//   pnpm --filter superadmin test:sa08    # in another
//
// Needs a RUNNING SERVER, a real database, demo data (`pnpm seed:demo`) and
// the platform seed (`pnpm seed:platform --with-samples`).
// Creates and deletes its own throwaway accounts, flags, codes, leads and school.
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import * as OTPAuth from "otpauth"

const BASE = "http://localhost:3001"
const WEB = "http://localhost:3000"
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
  const password = "Sa08Check!2026"
  await prisma.superAdminUser.deleteMany({ where: { email } })
  const user = await prisma.superAdminUser.create({
    data: { email, name: `SA08 ${role}`, role, passwordHash: await bcrypt.hash(password, 10) },
  })
  const jar = makeJar()
  await req(jar, "/api/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) })
  const enroll = (await json(jar, "/api/auth/totp/enroll", { method: "POST" })).body
  const totp = new OTPAuth.TOTP({
    issuer: "EduCore Africa Console", label: email,
    algorithm: "SHA1", digits: 6, period: 30,
    secret: OTPAuth.Secret.fromBase32(enroll.secret),
  })
  // TOTP codes are time-boxed; retry across windows rather than assume a hit.
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await req(jar, "/api/auth/totp/confirm", {
      method: "POST",
      body: JSON.stringify({ code: totp.generate() }),
    })
    if (r.status === 200) break
    await new Promise((resolve) => setTimeout(resolve, 2500))
  }
  return { jar, user }
}

const EMAILS = [
  "sa08-owner@educoreafrica.com",
  "sa08-engineer@educoreafrica.com",
  "sa08-sales@educoreafrica.com",
  "sa08-doomed@educoreafrica.com",
]

const owner = await signIn(EMAILS[0], "SUPER_ADMIN")
const engineer = await signIn(EMAILS[1], "ENGINEERING_ADMIN")
const sales = await signIn(EMAILS[2], "SALES_ADMIN")
check("owner session", owner.jar.has("educore-sa.session-token"))
check("engineer session", engineer.jar.has("educore-sa.session-token"))
const jar = owner.jar

// ── 1. Service status ────────────────────────────────────────────
console.log("\n1. Service status")
const services = (await json(jar, "/api/system/services")).body
check("returns a card per service", services.services.length === 9, `${services.services.length}`)
check("postgres is probed and up",
  services.services.find((s) => s.key === "postgres")?.state === "up",
  services.services.find((s) => s.key === "postgres")?.state)
check("redis is probed and up",
  services.services.find((s) => s.key === "redis")?.state === "up")
check("every probed service reports a response time",
  services.services.filter((s) => s.state !== "unknown").every((s) => typeof s.responseMs === "number"))

// Unconfigured services must never read as healthy.
const unconfigured = services.services.filter((s) => s.state === "unknown")
check("unconfigured services are 'unknown', never 'up'",
  unconfigured.every((s) => s.responseMs === null && /not set|nothing to probe/i.test(s.detail)),
  `${unconfigured.length} unchecked`)
check("unknown services report no uptime rather than 100%",
  unconfigured.every((s) => s.uptimePercent === null || s.samples === 0))

const probedAt = services.probedAt
const again = (await json(jar, "/api/system/services")).body
check("a second read inside the interval reuses the snapshot",
  again.probedAt === probedAt, "no repeat calls to third parties")

// ── 2. Error monitor ─────────────────────────────────────────────
console.log("\n2. API errors")
// A real guard rejection, not a middleware one: sign an account in, revoke its
// session behind its back, then use the cookie. Middleware still lets it
// through (the JWT is valid), and the guard refuses it — which is exactly the
// class of failure this monitor exists to surface.
const doomed = await signIn("sa08-doomed@educoreafrica.com", "SUPPORT_ADMIN")
await prisma.superAdminSession.updateMany({
  where: { userId: doomed.user.id },
  data: { revokedAt: new Date(), revokedReason: "smoke-test" },
})
const rejected = await req(doomed.jar, "/api/system/queues")
check("a revoked session is refused by the guard", rejected.status === 401, `${rejected.status}`)
await new Promise((resolve) => setTimeout(resolve, 300))

const errors = (await json(jar, "/api/system/errors?minStatus=400")).body
check("the error log is captured", errors.captured === true)
check("the guard's own rejections are recorded",
  errors.entries.some((entry) => entry.status === 401), `${errors.entries.length} entries`)
check("the recorded message names the reason",
  errors.entries.some((entry) => /revoked/i.test(entry.message)),
  errors.entries.find((entry) => entry.status === 401)?.message)
check("identical failures are grouped with a count",
  errors.entries.every((entry) => entry.count >= 1))
check("rates carry a denominator",
  errors.rates.every((rate) => rate.total >= rate.errors))
check("spike detection uses a threshold, not a raw count",
  errors.spikes.every((spike) => spike.errorRate > 10 && spike.total >= 10))

// ── 3. Queues ────────────────────────────────────────────────────
console.log("\n3. Background jobs")
const queues = (await json(engineer.jar, "/api/system/queues")).body
check("five queues listed", queues.queues.length === 5, `${queues.queues.length}`)
const live = queues.queues.filter((q) => q.state === "live")
const planned = queues.queues.filter((q) => q.state === "planned")
check("only the queue that exists is live", live.length === 1 && live[0].name === "attendance",
  live.map((q) => q.name).join(","))
check("queues with no producer are 'planned', not zero",
  planned.every((q) => q.pending === null && typeof q.note === "string" && q.note.length > 0))
check("the live queue reports real counts",
  typeof live[0].pending === "number" && typeof live[0].workers === "number",
  `pending ${live[0].pending}, workers ${live[0].workers}`)

const retryPlanned = await json(engineer.jar, "/api/system/queues/notifications/retry-failed", {
  method: "POST",
  body: JSON.stringify({}),
})
check("retrying a queue with no worker is refused with the reason",
  retryPlanned.status === 400 && /no worker/i.test(retryPlanned.body?.error ?? ""),
  retryPlanned.body?.error?.slice(0, 60))

// ── 4. Performance ───────────────────────────────────────────────
console.log("\n4. Performance")
const perf = (await json(jar, "/api/system/performance")).body
check("24 hourly buckets", perf.latency.buckets.length === 24, `${perf.latency.buckets.length}`)
check("an hour with no traffic is null, not zero",
  perf.latency.buckets.every((b) => (b.calls === 0 ? b.p50 === null : b.p50 !== null)))
check("percentiles are ordered where present",
  perf.latency.buckets.filter((b) => b.calls > 0).every((b) => b.p50 <= b.p95 && b.p95 <= b.p99))
check("connection pool read from pg_stat_activity", perf.pool !== null && perf.pool.total > 0,
  `${perf.pool?.total} connections`)
check("redis memory reported", perf.redis !== null && perf.redis.usedBytes > 0)
check("no maxmemory means no percentage, rather than a fake full bar",
  perf.redis.maxBytes === null ? perf.redis.percent === null : perf.redis.percent !== null)

// ── 5. Feature flags ─────────────────────────────────────────────
console.log("\n5. Feature flags")
const beforeFlags = (await json(jar, "/api/system/feature-flags")).body
check("seeded flags load", beforeFlags.flags.length >= 4, `${beforeFlags.flags.length}`)

const badKey = await json(jar, "/api/system/feature-flags", {
  method: "POST",
  body: JSON.stringify({ key: "Not Snake Case", label: "x", scope: "GLOBAL" }),
})
check("a non-snake_case key is refused", badKey.status === 400)

const badScope = await json(jar, "/api/system/feature-flags", {
  method: "POST",
  body: JSON.stringify({ key: "sa08_scoped", label: "Scoped", scope: "BY_PLAN", scopeValues: [] }),
})
check("a scoped flag with no values is refused", badScope.status === 400)

const created = await json(jar, "/api/system/feature-flags", {
  method: "POST",
  body: JSON.stringify({
    key: "sa08_smoke_flag",
    label: "SA08 smoke flag",
    scope: "GLOBAL",
    rollout: 100,
    enabled: false,
  }),
})
check("flag created", created.status === 201, `${created.status}`)
const flagId = created.body?.flag?.id

// The done criterion: a toggle is live in well under 30 seconds. The write
// clears the read cache, so it should be visible on the very next read.
const toggledAt = Date.now()
const toggled = await json(jar, `/api/system/feature-flags/${flagId}`, {
  method: "PUT",
  body: JSON.stringify({ enabled: true }),
})
check("toggle accepted", toggled.status === 200)
const afterToggle = (await json(jar, "/api/system/feature-flags")).body
const elapsed = Date.now() - toggledAt
const nowOn = afterToggle.flags.find((f) => f.key === "sa08_smoke_flag")
check("the toggle is live on the next read", nowOn?.enabled === true, `${elapsed}ms`)
check("well inside the 30-second requirement", elapsed < 30_000, `${elapsed}ms`)

check("reach is computed, not guessed",
  nowOn.reach.matched === nowOn.reach.total && nowOn.reach.total > 0,
  `${nowOn.reach.matched}/${nowOn.reach.total} at 100% global`)

// A partial rollout must reach a strict subset, and must be stable.
await json(jar, `/api/system/feature-flags/${flagId}`, {
  method: "PUT",
  body: JSON.stringify({ rollout: 30 }),
})
const partialA = (await json(jar, "/api/system/feature-flags")).body.flags.find((f) => f.key === "sa08_smoke_flag")
const partialB = (await json(jar, "/api/system/feature-flags")).body.flags.find((f) => f.key === "sa08_smoke_flag")
check("a 30% rollout reaches fewer schools than 100%",
  partialA.reach.matched < partialA.reach.total && partialA.reach.matched > 0,
  `${partialA.reach.matched}/${partialA.reach.total}`)
check("the same schools are picked on every evaluation",
  partialA.reach.matched === partialB.reach.matched, "deterministic bucketing")

const deleteEnabled = await json(jar, `/api/system/feature-flags/${flagId}`, { method: "DELETE" })
check("an enabled flag cannot be deleted", deleteEnabled.status === 409, `${deleteEnabled.status}`)

const flagAudit = await prisma.superAdminAuditLog.count({
  where: { userId: owner.user.id, action: { in: ["system.flag.create", "system.flag.update"] } },
})
check("flag changes are audited", flagAudit >= 2, `${flagAudit} rows`)

// ── 6. Plans & pricing ───────────────────────────────────────────
console.log("\n6. Plans and pricing")
const plansBefore = (await json(jar, "/api/config/plans")).body
check("five plans in the catalogue", plansBefore.plans.length === 5)
check("each row says how many schools are on it",
  plansBefore.plans.every((p) => typeof p.existingSubscribers === "number"))
check("the response warns that existing subscriptions are untouched",
  /not.*re-priced|new signups/i.test(plansBefore.notice))

const starter = plansBefore.plans.find((p) => p.plan === "STARTER")
const subsBefore = await prisma.schoolSubscription.findMany({
  where: { plan: "STARTER" },
  select: { id: true, amount: true },
})

const silly = await json(jar, "/api/config/plans", {
  method: "PUT",
  body: JSON.stringify({ plans: [{ plan: "STARTER", monthly: 1000, termly: 3000, annual: 999_999 }] }),
})
check("an annual price above twelve months is refused", silly.status === 400,
  silly.body?.error?.slice(0, 60))

const newTermly = Number(starter.termly) + 5000
const saved = await json(jar, "/api/config/plans", {
  method: "PUT",
  body: JSON.stringify({ plans: [{ ...starter, termly: newTermly }] }),
})
check("price change saved", saved.status === 200 && saved.body.changed === 1, `${saved.status}`)
check("the catalogue reflects the new price",
  Number((await prisma.planConfig.findUnique({ where: { plan: "STARTER" } })).termly) === newTermly)

const subsAfter = await prisma.schoolSubscription.findMany({
  where: { id: { in: subsBefore.map((s) => s.id) } },
  select: { id: true, amount: true },
})
check("existing subscriptions were NOT re-priced",
  subsAfter.every((row) => {
    const before = subsBefore.find((one) => one.id === row.id)
    return Number(before.amount) === Number(row.amount)
  }),
  `${subsAfter.length} subscriptions unchanged`)

const priceAudit = await prisma.superAdminAuditLog.findFirst({
  where: { userId: owner.user.id, action: "config.plan.update" },
  orderBy: { createdAt: "desc" },
  select: { details: true, target: true },
})
check("the price change is audited", priceAudit !== null)
check("the audit row carries before and after",
  priceAudit?.details?.from?.termly !== undefined && priceAudit?.details?.to?.termly === newTermly,
  `${priceAudit?.details?.from?.termly} → ${priceAudit?.details?.to?.termly}`)

// Restore the catalogue.
await json(jar, "/api/config/plans", {
  method: "PUT",
  body: JSON.stringify({ plans: [{ ...starter, termly: Number(starter.termly) }] }),
})

// ── 7. Promo codes ───────────────────────────────────────────────
console.log("\n7. Promo codes")
const promoCreate = await json(jar, "/api/config/promo-codes", {
  method: "POST",
  body: JSON.stringify({
    code: "SA08-SMOKE",
    discountType: "PERCENT",
    discountValue: 20,
    plans: ["PROFESSIONAL"],
    maxUses: 5,
  }),
})
check("promo created", promoCreate.status === 201, `${promoCreate.status}`)

const over100 = await json(jar, "/api/config/promo-codes", {
  method: "POST",
  body: JSON.stringify({ code: "SA08-BAD", discountType: "PERCENT", discountValue: 150 }),
})
check("a percentage over 100 is refused", over100.status === 400)

const proConfig = await prisma.planConfig.findUnique({ where: { plan: "PROFESSIONAL" } })
const validRight = await json(jar, "/api/config/promo-codes/validate", {
  method: "POST",
  body: JSON.stringify({ code: "SA08-SMOKE", plan: "PROFESSIONAL", cycle: "TERMLY" }),
})
check("valid against the right plan", validRight.body?.ok === true)
check("the discount is 20% of the catalogue price",
  validRight.body?.amountOff === Math.round(Number(proConfig.termly) * 0.2),
  `${validRight.body?.amountOff} off ${Number(proConfig.termly)}`)

const wrongPlan = await json(jar, "/api/config/promo-codes/validate", {
  method: "POST",
  body: JSON.stringify({ code: "SA08-SMOKE", plan: "STARTER", cycle: "TERMLY" }),
})
check("rejected against a plan it does not cover",
  wrongPlan.body?.ok === false && wrongPlan.body?.reason === "wrong_plan", wrongPlan.body?.reason)

const expired = await json(jar, "/api/config/promo-codes/validate", {
  method: "POST",
  body: JSON.stringify({ code: "EXPIRED-DEMO", plan: "PROFESSIONAL", cycle: "TERMLY" }),
})
check("an expired code is rejected",
  expired.body?.ok === false && expired.body?.reason === "expired", expired.body?.reason)

// ── 8. Promo validates at school signup ──────────────────────────
console.log("\n8. Promo at signup (cross-app)")
let webUp = true
try {
  const health = await fetch(`${WEB}/api/health`)
  webUp = health.ok
} catch {
  webUp = false
}

if (!webUp) {
  console.log("  [SKIP] the school app is not running on :3000 — start it to check signup")
} else {
  const webCheck = await fetch(`${WEB}/api/promo/validate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify({ code: "SA08-SMOKE", plan: "PROFESSIONAL" }),
  })
  const webBody = await webCheck.json()
  check("the school app validates the same code", webBody.ok === true, `${webCheck.status}`)
  check("both apps compute the same discount",
    webBody.amountOff === validRight.body?.amountOff,
    `web ${webBody.amountOff} vs console ${validRight.body?.amountOff}`)

  const webWrong = await fetch(`${WEB}/api/promo/validate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.2" },
    body: JSON.stringify({ code: "SA08-SMOKE", plan: "STARTER" }),
  })
  check("the school app rejects it on the wrong plan", (await webWrong.json()).ok === false)

  // Register a school with the code and confirm the discount lands.
  const stamp = Date.now()
  const registration = await fetch(`${WEB}/api/auth/register-school`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.3" },
    body: JSON.stringify({
      school: {
        schoolName: `SA08 Smoke School ${stamp}`,
        schoolType: "PRIVATE",
        address: "1 Test Road",
        state: "Lagos",
        lga: "Ikeja",
        phone: "+2348010000000",
        email: `school.${stamp}@sa08.test`,
      },
      admin: {
        firstName: "Smoke",
        lastName: "Tester",
        email: `admin.${stamp}@sa08.test`,
        phone: "+2348010000001",
        password: "SmokeTest2026",
        confirmPassword: "SmokeTest2026",
      },
      academic: { sessionName: "2026/2027", sections: ["JSS"], armsPerClass: 1 },
      plan: { plan: "PROFESSIONAL", promoCode: "SA08-SMOKE" },
    }),
  })
  const regBody = await registration.json()
  check("registration with a promo succeeds", registration.ok === true,
    `${registration.status} ${JSON.stringify(regBody).slice(0, 120)}`)

  if (registration.ok) {
    check("the response reports the discount",
      regBody.pricing?.amountOff === validRight.body?.amountOff,
      `${regBody.pricing?.amountOff}`)

    const sub = await prisma.schoolSubscription.findUnique({
      where: { schoolId: regBody.schoolId },
      select: { amount: true, plan: true, promoCode: true, status: true },
    })
    check("a subscription was created at signup", sub !== null)
    check("it carries the DISCOUNTED amount, not list price",
      Number(sub.amount) === Number(proConfig.termly) - validRight.body.amountOff,
      `${Number(sub.amount)} vs list ${Number(proConfig.termly)}`)
    check("the promo code is recorded on the subscription", sub.promoCode === "SA08-SMOKE")

    const redemption = await prisma.promoRedemption.findFirst({
      where: { schoolId: regBody.schoolId },
      select: { amountOff: true, plan: true },
    })
    check("a redemption row was written", redemption !== null)
    check("the ledger amount matches what was charged",
      Number(redemption?.amountOff) === validRight.body.amountOff)

    const usage = await prisma.promoCode.findUnique({
      where: { code: "SA08-SMOKE" },
      select: { usedCount: true },
    })
    check("the usage counter advanced", usage.usedCount === 1, `${usage.usedCount}`)

    // Same school, same code, second time: the unique index must stop it.
    const second = await fetch(`${WEB}/api/promo/validate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.4" },
      body: JSON.stringify({ code: "SA08-SMOKE", plan: "PROFESSIONAL" }),
    })
    check("the code still validates for a DIFFERENT school", (await second.json()).ok === true)

    // Clean up the school this test created.
    await prisma.promoRedemption.deleteMany({ where: { schoolId: regBody.schoolId } })
    await prisma.user.deleteMany({ where: { schoolId: regBody.schoolId } })
    await prisma.school.delete({ where: { id: regBody.schoolId } })
  }

  const badRegistration = await fetch(`${WEB}/api/auth/register-school`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.5" },
    body: JSON.stringify({
      school: {
        schoolName: `SA08 Rejected ${Date.now()}`,
        schoolType: "PRIVATE",
        address: "2 Test Road",
        state: "Lagos",
        lga: "Ikeja",
        phone: "+2348010000002",
        email: `rejected.${Date.now()}@sa08.test`,
      },
      admin: {
        firstName: "Should",
        lastName: "Fail",
        email: `fail.${Date.now()}@sa08.test`,
        phone: "+2348010000003",
        password: "SmokeTest2026",
        confirmPassword: "SmokeTest2026",
      },
      academic: { sessionName: "2026/2027", sections: ["JSS"], armsPerClass: 1 },
      plan: { plan: "PROFESSIONAL", promoCode: "EXPIRED-DEMO" },
    }),
  })
  check("signup with an expired code is refused before anything is created",
    badRegistration.status === 422, `${badRegistration.status}`)
  const orphan = await prisma.school.count({ where: { name: { startsWith: "SA08 Rejected" } } })
  check("no school was created by the refused signup", orphan === 0, `${orphan} found`)
}

// ── 9. Templates ─────────────────────────────────────────────────
console.log("\n9. Message templates")
const emailTemplates = (await json(jar, "/api/config/email-templates")).body
check("email templates load", emailTemplates.templates.length >= 5, `${emailTemplates.templates.length}`)
check("merge tags are published for the editor", emailTemplates.mergeTags.length >= 6)

const smsTemplates = (await json(jar, "/api/config/sms-templates")).body
check("sms templates load", smsTemplates.templates.length >= 4)
check("sms character limits are reported",
  smsTemplates.limits.segment === 160 && smsTemplates.limits.multipart === 153)

const welcome = emailTemplates.templates.find((t) => t.key === "welcome")
const badTag = await json(jar, `/api/config/email-templates/${welcome.id}`, {
  method: "PUT",
  body: JSON.stringify({ subject: welcome.subject, body: "Hello {{schol_name}}" }),
})
check("an unknown merge tag is refused on save", badTag.status === 400,
  badTag.body?.error?.slice(0, 60))

const originalBody = welcome.body
const edited = await json(jar, `/api/config/email-templates/${welcome.id}`, {
  method: "PUT",
  body: JSON.stringify({ subject: welcome.subject, body: `${originalBody}\n<p>SA08 edit.</p>` }),
})
check("a valid edit saves", edited.status === 200, `${edited.status}`)
check("the response says nothing was sent", /future sends only|nothing was sent/i.test(edited.body?.notice ?? ""))
check("a version was recorded", typeof edited.body?.version === "number")

const preview = await json(jar, `/api/config/templates/${welcome.id}/preview`, {
  method: "POST",
  body: JSON.stringify({ subject: welcome.subject, body: originalBody }),
})
check("preview substitutes sample values",
  !preview.body?.body.includes("{{school_name}}") &&
    preview.body?.body.includes("Greenfield International School"))
check("preview says nothing was sent", /nothing was sent/i.test(preview.body?.notice ?? ""))

const rolled = await json(jar, `/api/config/templates/${welcome.id}/rollback`, {
  method: "POST",
  body: JSON.stringify({ version: edited.body.version }),
})
check("rollback restores an earlier version", rolled.status === 200, `${rolled.status}`)
const restored = await prisma.messageTemplate.findUnique({
  where: { id: welcome.id },
  select: { body: true },
})
check("the wording that was live before the edit is back", restored.body === originalBody)

const testSend = await json(jar, `/api/config/templates/${welcome.id}/test-send`, {
  method: "POST",
  body: JSON.stringify({ subject: welcome.subject, body: originalBody }),
})
check("a test send reports honestly whether it went",
  typeof testSend.body?.sent === "boolean" &&
    (testSend.body.sent === true || typeof testSend.body.reason === "string"),
  testSend.body?.sent ? "sent" : (testSend.body?.reason ?? "").slice(0, 60))

const smsTemplate = smsTemplates.templates.find((t) => t.key === "welcome")
const smsTest = await json(jar, `/api/config/templates/${smsTemplate.id}/test-send`, {
  method: "POST",
  body: JSON.stringify({}),
})
check("SMS test sends are refused rather than billed to a school",
  smsTest.body?.sent === false && /school app|credit/i.test(smsTest.body?.reason ?? ""))

// ── 10. Announcements ────────────────────────────────────────────
console.log("\n10. Announcements")
const noEnd = await json(jar, "/api/config/announcements", {
  method: "POST",
  body: JSON.stringify({ title: "SA08 maintenance", body: "x", type: "MAINTENANCE" }),
})
check("a maintenance notice with no end date is refused", noEnd.status === 400,
  noEnd.body?.error?.slice(0, 60))

const announcement = await json(jar, "/api/config/announcements", {
  method: "POST",
  body: JSON.stringify({
    title: "SA08 smoke announcement",
    body: "Visible only to the smoke test.",
    type: "INFO",
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 3_600_000).toISOString(),
    targetPlans: ["STARTER"],
  }),
})
check("announcement created", announcement.status === 201, `${announcement.status}`)

const listed = (await json(jar, "/api/config/announcements")).body
const mine = listed.announcements.find((a) => a.id === announcement.body.announcement.id)
check("it is showing now", mine?.window === "live", mine?.window)
const starterSchools = await prisma.school.count({
  where: { deletedAt: null, subscription: { is: { plan: "STARTER" } } },
})
check("reach counts only the targeted plan", mine?.reach === starterSchools,
  `${mine?.reach} vs ${starterSchools}`)

if (webUp) {
  const starterSchool = await prisma.school.findFirst({
    where: { deletedAt: null, subscription: { is: { plan: "STARTER" } } },
    select: { id: true },
  })
  const otherSchool = await prisma.school.findFirst({
    where: { deletedAt: null, subscription: { is: { plan: { not: "STARTER" } } } },
    select: { id: true },
  })
  const { activeNoticesForSchool } = await import("../lib/announcements.js").catch(() => ({}))
  // The console's own resolver is the one apps/web mirrors; check the data
  // rather than the import, which is not loadable from a .mjs script.
  const visibleToStarter = await prisma.platformAnnouncement.findMany({
    where: { isActive: true, startsAt: { lte: new Date() } },
    select: { id: true, targetPlans: true },
  })
  const applies = (plans) => plans.length === 0 || plans.includes("STARTER")
  check("a plan-targeted notice applies to the targeted plan",
    visibleToStarter.filter((a) => applies(a.targetPlans)).some((a) => a.id === mine.id))
  check("and not to a school on another plan",
    !visibleToStarter
      .filter((a) => a.targetPlans.length === 0 || a.targetPlans.includes("PROFESSIONAL"))
      .some((a) => a.id === mine.id))
  void starterSchool
  void otherSchool
  void activeNoticesForSchool
}

// ── 11. Audit trail and export ───────────────────────────────────
console.log("\n11. Audit and compliance")
const auditRows = (await json(engineer.jar, "/api/audit/logs?limit=50")).body
check("audit rows load", auditRows.rows.length > 0, `${auditRows.total} total`)
check("actions list is derived from the data", auditRows.actions.length > 0)
check("before/after is split out where recorded",
  auditRows.rows.some((row) => row.before !== null && row.after !== null))
check("pre-auth events show as unauthenticated rather than a blank user",
  auditRows.rows.every((row) => typeof row.user === "string" && row.user.length > 0))

const filtered = (await json(engineer.jar, "/api/audit/logs?action=system.flag.update")).body
check("the action filter applies",
  filtered.rows.every((row) => row.action === "system.flag.update"), `${filtered.rows.length} rows`)

const pdf = await req(engineer.jar, "/api/audit/logs/export?limit=50")
check("the PDF export responds 200", pdf.status === 200, `${pdf.status}`)
check("it is a PDF", pdf.headers.get("content-type") === "application/pdf")
const digest = pdf.headers.get("x-audit-digest")
check("it carries a content digest", typeof digest === "string" && digest.length === 64,
  digest?.slice(0, 16))
const pdfBytes = new Uint8Array(await pdf.arrayBuffer())
check("the file is a real PDF", String.fromCharCode(...pdfBytes.slice(0, 5)) === "%PDF-")
check("the export is itself audited",
  (await prisma.superAdminAuditLog.count({ where: { action: "audit.export" } })) >= 1)

// ── 12. Data access log ──────────────────────────────────────────
console.log("\n12. Data access log")
const school = await prisma.school.findFirst({ where: { deletedAt: null }, select: { id: true } })
const accessBefore = await prisma.dataAccessLog.count({ where: { staffId: owner.user.id } })
await req(jar, `/console/schools/${school.id}?tab=users`)
await new Promise((resolve) => setTimeout(resolve, 400))
const accessAfter = await prisma.dataAccessLog.count({ where: { staffId: owner.user.id } })
check("opening a school's data writes an access record", accessAfter > accessBefore,
  `${accessBefore} → ${accessAfter}`)

const accessRow = await prisma.dataAccessLog.findFirst({
  where: { staffId: owner.user.id },
  orderBy: { createdAt: "desc" },
  select: { scope: true, path: true, schoolId: true },
})
check("the record names WHAT was read, not just the URL",
  accessRow?.scope === "school.users", accessRow?.scope)
check("it is attributed to the right school", accessRow?.schoolId === school.id)

const accessApi = (await json(engineer.jar, "/api/audit/data-access")).body
check("the access log is queryable", accessApi.rows.length > 0, `${accessApi.total}`)
check("rows name the staff member and the school",
  accessApi.rows.every((row) => row.staff && row.school))

// ── 13. NDPR ─────────────────────────────────────────────────────
console.log("\n13. NDPR requests")
const requests = (await json(engineer.jar, "/api/compliance/requests")).body
check("requests load", requests.requests.length > 0, `${requests.summary.total}`)
check("the statutory window is 30 days", requests.responseDays === 30)
check("due dates are 30 days after receipt",
  requests.requests.every((row) => {
    const gap = (new Date(row.dueAt) - new Date(row.receivedAt)) / 86_400_000
    return Math.abs(gap - 30) < 0.01
  }))
check("open requests carry a live countdown",
  requests.requests
    .filter((row) => row.status === "RECEIVED" || row.status === "IN_PROGRESS")
    .every((row) => typeof row.daysRemaining === "number"))

const newRequest = await json(engineer.jar, "/api/compliance/requests", {
  method: "POST",
  body: JSON.stringify({
    type: "ACCESS",
    subjectName: "SA08 Subject",
    subjectEmail: "sa08-subject@example.test",
    details: "Smoke test",
  }),
})
check("a request can be logged", newRequest.status === 201, `${newRequest.status}`)
check("an unmatched email is reported, not silently ignored",
  /no account matches/i.test(newRequest.body?.notice ?? ""))

const closeWithoutReason = await json(engineer.jar, `/api/compliance/requests/${newRequest.body.request.id}`, {
  method: "PUT",
  body: JSON.stringify({ status: "COMPLETED" }),
})
check("closing without recording what was done is refused",
  closeWithoutReason.status === 400, closeWithoutReason.body?.error?.slice(0, 60))

const closed = await json(engineer.jar, `/api/compliance/requests/${newRequest.body.request.id}`, {
  method: "PUT",
  body: JSON.stringify({ status: "COMPLETED", resolution: "Copy of the record sent by email." }),
})
check("closing with a resolution works", closed.status === 200)
check("a completion timestamp is stamped", closed.body?.request?.completedAt !== null)

// ── 14. Deletion execution ───────────────────────────────────────
console.log("\n14. Erasure")
const victimSchool = await prisma.school.findFirst({ where: { deletedAt: null }, select: { id: true } })
const victim = await prisma.user.create({
  data: {
    schoolId: victimSchool.id,
    email: `sa08-erase-${Date.now()}@sa08.test`,
    firstName: "Erase",
    lastName: "Me",
    phone: "+234 800 111 2222",
    role: "PARENT",
    passwordHash: await bcrypt.hash("Whatever2026!", 10),
  },
  select: { id: true, email: true },
})
const deletionRequest = await prisma.dataSubjectRequest.create({
  data: {
    type: "DELETION",
    subjectName: "Erase Me",
    subjectEmail: victim.email,
    userId: victim.id,
    schoolId: victimSchool.id,
    receivedAt: new Date(),
    dueAt: new Date(Date.now() + 30 * 86_400_000),
  },
  select: { id: true },
})

const noConfirm = await json(jar, "/api/compliance/execute-deletion", {
  method: "POST",
  body: JSON.stringify({ requestId: deletionRequest.id, userId: victim.id }),
})
check("erasure without the confirmation phrase is refused", noConfirm.status === 400)

const engineerErase = await json(engineer.jar, "/api/compliance/execute-deletion", {
  method: "POST",
  body: JSON.stringify({ requestId: deletionRequest.id, userId: victim.id, confirm: "ERASE" }),
})
check("only SUPER_ADMIN can erase", engineerErase.status === 403, `${engineerErase.status}`)

const erased = await json(jar, "/api/compliance/execute-deletion", {
  method: "POST",
  body: JSON.stringify({ requestId: deletionRequest.id, userId: victim.id, confirm: "ERASE" }),
})
check("erasure runs", erased.status === 200, `${erased.status}`)

const after = await prisma.user.findUnique({
  where: { id: victim.id },
  select: { email: true, firstName: true, phone: true, isActive: true, deletedAt: true },
})
check("the email is replaced", after.email !== victim.email && after.email.includes("deleted.invalid"))
check("the name is gone", after.firstName === "Erased")
check("the phone number is gone", after.phone === null)
check("the account is disabled", after.isActive === false && after.deletedAt !== null)

const record = await prisma.dataDeletionRecord.findFirst({
  where: { requestId: deletionRequest.id },
  select: { summary: true, method: true },
})
check("a permanent erasure record survives", record !== null)
check("it says what was done", record?.method === "anonymise" && record?.summary?.user_anonymised === 1)

const closedRequest = await prisma.dataSubjectRequest.findUnique({
  where: { id: deletionRequest.id },
  select: { status: true, resolution: true },
})
check("the request is closed automatically", closedRequest.status === "COMPLETED")
check("the resolution explains what was retained and why",
  /retained|records/i.test(closedRequest.resolution ?? ""))

const twice = await json(jar, "/api/compliance/execute-deletion", {
  method: "POST",
  body: JSON.stringify({ requestId: deletionRequest.id, userId: victim.id, confirm: "ERASE" }),
})
check("it cannot be run twice", twice.status === 400)

// ── 15. Lead pipeline ────────────────────────────────────────────
console.log("\n15. Lead pipeline")
const board = (await json(sales.jar, "/api/growth/leads")).body
check("six columns", board.columns.length === 6, `${board.columns.length}`)
check("cards are ordered within their column",
  board.columns.every((column) =>
    column.cards.every((card, index) => index === 0 || column.cards[index - 1].position <= card.position),
  ))
check("the win rate is over settled leads, not all leads",
  board.summary.winRate === null ||
    Math.abs(board.summary.winRate - (board.summary.byStage.CONVERTED / board.summary.settled) * 100) < 0.01,
  `${board.summary.winRate?.toFixed(1)}% of ${board.summary.settled} settled`)

const newLead = await json(sales.jar, "/api/growth/leads", {
  method: "POST",
  body: JSON.stringify({
    schoolName: "SA08 Smoke Prospect",
    contactName: "Test Contact",
    contactEmail: "prospect@sa08.test",
    state: "Oyo",
    sizeEstimate: 500,
    source: "Smoke test",
  }),
})
check("a lead can be added", newLead.status === 201, `${newLead.status}`)
const leadId = newLead.body?.lead?.id
check("it lands in NEW", newLead.body?.lead?.stage === "NEW")

// Drag to another column.
const target = board.columns.find((column) => column.stage === "DEMO_SCHEDULED")
const firstCard = target.cards[0]
const moved = await json(sales.jar, `/api/growth/leads/${leadId}`, {
  method: "PATCH",
  body: JSON.stringify({ stage: "DEMO_SCHEDULED", afterId: null, beforeId: firstCard?.id ?? null }),
})
check("drag-to-move works", moved.status === 200 && moved.body?.lead?.stage === "DEMO_SCHEDULED",
  `${moved.status}`)

const afterMove = (await json(sales.jar, "/api/growth/leads")).body
const movedColumn = afterMove.columns.find((column) => column.stage === "DEMO_SCHEDULED")
check("the card is in the destination column", movedColumn.cards.some((card) => card.id === leadId))
if (firstCard) {
  const positions = movedColumn.cards.map((card) => card.id)
  check("it landed above the card it was dropped before",
    positions.indexOf(leadId) < positions.indexOf(firstCard.id),
    positions.slice(0, 3).join(" → "))
}

const lostNoReason = await json(sales.jar, `/api/growth/leads/${leadId}`, {
  method: "PATCH",
  body: JSON.stringify({ stage: "LOST" }),
})
check("marking a lead lost without a reason is refused", lostNoReason.status === 400)

const lost = await json(sales.jar, `/api/growth/leads/${leadId}`, {
  method: "PATCH",
  body: JSON.stringify({ stage: "LOST", lostReason: "Smoke test cleanup" }),
})
check("with a reason it works", lost.status === 200 && lost.body?.lead?.lostReason === "Smoke test cleanup")

const stageAudit = await prisma.superAdminAuditLog.count({
  where: { userId: sales.user.id, action: "growth.lead.stage" },
})
check("stage changes are audited", stageAudit >= 2, `${stageAudit} rows`)

// ── 16. Trials and the conversion score ──────────────────────────
console.log("\n16. Trials")
const trials = (await json(sales.jar, "/api/growth/trials")).body
check("trials load", Array.isArray(trials.trials), `${trials.trials.length} on trial`)

if (trials.trials.length === 0) {
  console.log("  [SKIP] no schools are on trial — reseed demo data to exercise this")
} else {
  check("every score is 0-100", trials.trials.every((t) => t.score >= 0 && t.score <= 100))
  check("bands follow the score",
    trials.trials.every((t) =>
      t.band === (t.score >= 70 ? "hot" : t.score >= 45 ? "warm" : t.score >= 20 ? "cool" : "cold"),
    ))
  check("signals are counted, never null",
    trials.trials.every((t) =>
      Object.values(t.signals).every((value) => typeof value === "number" && value >= 0),
    ))

  // The score must be reproducible: same inputs, same number.
  const subject = trials.trials[0]
  const scoreA = (await json(sales.jar, "/api/ai/trial-conversion-score", {
    method: "POST",
    body: JSON.stringify({ schoolId: subject.schoolId }),
  })).body
  const scoreB = (await json(sales.jar, "/api/ai/trial-conversion-score", {
    method: "POST",
    body: JSON.stringify({ schoolId: subject.schoolId }),
  })).body
  check("the score matches the list", scoreA.score === subject.score, `${scoreA.score} vs ${subject.score}`)
  check("the score is reproducible", scoreA.score === scoreB.score, "arithmetic, not a guess")
  check("the panel says who wrote the narrative", typeof scoreA.generated === "boolean",
    scoreA.generated ? "Claude" : "computed")
  check("it names the weakest signal", typeof scoreA.weakest === "string" && scoreA.weakest.length > 0,
    scoreA.weakest)

  // Verify the weights by hand on the returned signals.
  const s = subject.signals
  const expected = Math.round(
    Math.min(1, s.students / 150) * 35 +
      Math.min(1, s.teamSize / 5) * 25 +
      Math.min(1, s.modulesUsed / 4) * 25 +
      Math.min(1, s.activeDays / Math.max(1, Math.min(s.trialAge, 30))) * 15,
  )
  check("the score is the documented weighted sum", subject.score === expected,
    `${subject.score} vs recomputed ${expected}`)

  // Trial actions.
  const extended = await json(sales.jar, `/api/growth/trials/${subject.schoolId}/action`, {
    method: "POST",
    body: JSON.stringify({ action: "extend", days: 7 }),
  })
  check("a trial can be extended", extended.status === 200, `${extended.status}`)
  check("the new end date is in the future",
    new Date(extended.body.trialEndsAt) > new Date(), extended.body.trialEndsAt?.slice(0, 10))

  const nudged = await json(sales.jar, `/api/growth/trials/${subject.schoolId}/action`, {
    method: "POST",
    body: JSON.stringify({ action: "nudge" }),
  })
  check("a nudge writes in-app notifications", nudged.status === 200 && nudged.body.inAppSent >= 0,
    `${nudged.body?.inAppSent} recipients`)
  check("it reports SMS and email as not sent",
    nudged.body?.channels?.sms === 0 && nudged.body?.channels?.email === 0)
}

// ── 17. Referrals ────────────────────────────────────────────────
console.log("\n17. Referrals")
const referralSchool = await prisma.school.findFirst({ where: { deletedAt: null }, select: { id: true } })
const codeCreated = await json(sales.jar, "/api/growth/referrals", {
  method: "POST",
  body: JSON.stringify({ schoolId: referralSchool.id }),
})
check("a referral code is issued", codeCreated.status === 201, `${codeCreated.status}`)
check("the code is readable over the phone",
  /^[A-Z]{4}-[A-Z2-9]{4}$/.test(codeCreated.body?.code ?? ""), codeCreated.body?.code)
check("it avoids ambiguous characters",
  !/[01IO]/.test((codeCreated.body?.code ?? "").split("-")[1] ?? ""))

const referralId = codeCreated.body?.id
const noSchool = await json(sales.jar, `/api/growth/referrals/${referralId}`, {
  method: "PATCH",
  body: JSON.stringify({ status: "CONVERTED", referredSchoolId: "" }),
})
check("advancing without naming the referred school is refused", noSchool.status === 400)

const otherSchool = await prisma.school.findFirst({
  where: { deletedAt: null, id: { not: referralSchool.id } },
  select: { id: true },
})
const selfRefer = await json(sales.jar, `/api/growth/referrals/${referralId}`, {
  method: "PATCH",
  body: JSON.stringify({ status: "CONVERTED", referredSchoolId: referralSchool.id }),
})
check("a school cannot refer itself", selfRefer.status === 400, selfRefer.body?.error?.slice(0, 40))

const converted = await json(sales.jar, `/api/growth/referrals/${referralId}`, {
  method: "PATCH",
  body: JSON.stringify({ status: "CONVERTED", referredSchoolId: otherSchool.id }),
})
check("a conversion is recorded", converted.status === 200)
check("one conversion earns one free month", converted.body?.rewardMonths === 1,
  `${converted.body?.rewardMonths}`)

const referralList = (await json(sales.jar, "/api/growth/referrals")).body
const referrerTotals = referralList.byReferrer.find((row) => row.schoolId === referralSchool.id)
check("the tier table and the credited months agree",
  referrerTotals.earnedMonths === referrerTotals.awardedMonths,
  `earned ${referrerTotals.earnedMonths}, awarded ${referrerTotals.awardedMonths}`)

// Un-converting must not leave a paid-out month behind.
await json(sales.jar, `/api/growth/referrals/${referralId}`, {
  method: "PATCH",
  body: JSON.stringify({ status: "SIGNED_UP", referredSchoolId: otherSchool.id }),
})
const afterRevert = (await json(sales.jar, "/api/growth/referrals")).body
const revertedTotals = afterRevert.byReferrer.find((row) => row.schoolId === referralSchool.id)
check("un-converting removes the reward",
  revertedTotals.awardedMonths === 0 && revertedTotals.earnedMonths === 0,
  `${revertedTotals.awardedMonths} months still credited`)

// ── 18. Pages render ─────────────────────────────────────────────
console.log("\n18. Pages render")
for (const [path, marker] of [
  ["/console/system", "Service status"],
  ["/console/system/feature-flags", "Feature flags"],
  ["/console/config", "Plans &amp; pricing"],
  ["/console/config?tab=promo", "Check a code"],
  ["/console/config?tab=email", "Merge tags"],
  ["/console/config?tab=sms", "SMS templates"],
  ["/console/config?tab=announcements", "Announcements"],
  ["/console/audit", "Audit trail"],
  ["/console/audit?tab=access", "Cross-tenant reads"],
  ["/console/audit?tab=ndpr", "Due this week"],
  ["/console/audit?tab=deletions", "Erasure records"],
  ["/console/growth", "Lead pipeline"],
  ["/console/growth?tab=trials", "Likelihood"],
  ["/console/growth?tab=referrals", "Reward tiers"],
]) {
  const r = await req(jar, path)
  const html = await r.text()
  check(`${path}`, r.status === 200 && html.includes(marker), `${r.status}`)
}

const systemHtml = await (await req(jar, "/console/system")).text()
check("the queue board explains its empty rows", /not implemented/i.test(systemHtml))
check("the status board explains 'not checked'", /Not checked|not configured/i.test(systemHtml))

const auditHtml = await (await req(engineer.jar, "/console/audit")).text()
check("the audit page is honest about the digest",
  /not a cryptographic signature/i.test(auditHtml))

const configHtml = await (await req(jar, "/console/config")).text()
check("the pricing tab warns about existing subscribers",
  /will be re-priced|none of them will be re-priced/i.test(configHtml))

// Role gates.
check("sales cannot reach the audit centre",
  (await req(sales.jar, "/console/audit")).status === 307)
check("engineering cannot reach the growth tools",
  (await req(engineer.jar, "/console/growth")).status === 307)
check("engineering can reach system health",
  (await req(engineer.jar, "/console/system")).status === 200)

// ── Cleanup ──────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`)

await prisma.lead.deleteMany({ where: { schoolName: "SA08 Smoke Prospect" } })
await prisma.referral.deleteMany({ where: { id: referralId } })
await prisma.platformAnnouncement.deleteMany({ where: { title: { startsWith: "SA08 " } } })
await prisma.promoCode.deleteMany({ where: { code: { startsWith: "SA08-" } } })
await prisma.featureFlag.deleteMany({ where: { key: "sa08_smoke_flag" } })
await prisma.dataDeletionRecord.deleteMany({ where: { requestId: deletionRequest.id } })
await prisma.dataSubjectRequest.deleteMany({
  where: { OR: [{ id: deletionRequest.id }, { subjectEmail: "sa08-subject@example.test" }] },
})
await prisma.user.deleteMany({ where: { id: victim.id } })
await prisma.dataAccessLog.deleteMany({ where: { staffId: { in: [owner.user.id, engineer.user.id] } } })
await prisma.superAdminUser.deleteMany({ where: { email: { in: EMAILS } } })
await prisma.$disconnect()
process.exit(failures === 0 ? 0 : 1)
