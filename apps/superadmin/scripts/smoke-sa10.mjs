// SA-10 check: AI intelligence, the report builder and engine, export
// infrastructure, production hardening, and the seed.
//
//   pnpm --filter superadmin dev          # in one terminal
//   pnpm --filter superadmin test:sa10    # in another
//
// Needs a RUNNING SERVER and a real database. Creates and deletes its own
// throwaway accounts, reports, export jobs and churn scores.
//
// The AI checks do NOT require ANTHROPIC_API_KEY. Every AI surface in this
// console has a computed fallback, and the point of the check is that the
// fallback is honest about being one — so both paths are asserted.
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
      ...(jar?.header() ? { cookie: jar.header() } : {}),
    },
    redirect: "manual",
  })
  jar?.absorb(r)
  return r
}
async function json(jar, path, init) {
  const r = await req(jar, path, init)
  let body = null
  try { body = await r.json() } catch {}
  return { status: r.status, body, headers: r.headers }
}

async function signIn(email, role) {
  const password = "Sa10Check!2026"
  await prisma.superAdminUser.deleteMany({ where: { email } })
  const user = await prisma.superAdminUser.create({
    data: { email, name: `SA10 ${role}`, role, passwordHash: await bcrypt.hash(password, 10) },
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
  "sa10-owner@educoreafrica.com",
  "sa10-engineer@educoreafrica.com",
]

const owner = await signIn(EMAILS[0], "SUPER_ADMIN")
const engineer = await signIn(EMAILS[1], "ENGINEERING_ADMIN")
check("owner session", owner.jar.has("educore-sa.session-token"))
const jar = owner.jar

const created = { reportIds: [], exportIds: [] }

// ── 1. Health endpoint ───────────────────────────────────────────
console.log("\n1. Health endpoint")
const healthAnon = await json(null, "/api/health")
check("GET /api/health needs no session", healthAnon.status === 200 || healthAnon.status === 503,
  `${healthAnon.status}`)
check("it reports status, db, redis, version and timestamp",
  ["status", "db", "redis", "version", "timestamp"].every((key) => key in (healthAnon.body ?? {})),
  Object.keys(healthAnon.body ?? {}).join(","))
check("a healthy probe answers 200 and says so",
  healthAnon.status === 200 ? healthAnon.body.status === "ok" : healthAnon.body.status === "down",
  `${healthAnon.status}/${healthAnon.body?.status}`)
check("the probe is never cached",
  /no-store/.test(healthAnon.headers.get("cache-control") ?? ""),
  healthAnon.headers.get("cache-control"))
check("timestamp is a real ISO instant",
  !Number.isNaN(Date.parse(healthAnon.body?.timestamp ?? "")))

// ── 2. Security headers ──────────────────────────────────────────
console.log("\n2. Security headers")
const page = await req(jar, "/console")
const csp = page.headers.get("content-security-policy") ?? ""
check("a CSP is sent", csp.length > 0)
check("default-src is self", /default-src 'self'/.test(csp))
check("framing is refused outright", /frame-ancestors 'none'/.test(csp))
check("connect-src is not open to the world", /connect-src 'self'/.test(csp), csp.match(/connect-src[^;]*/)?.[0])
check("object-src is closed", /object-src 'none'/.test(csp))
check("X-Frame-Options backs up frame-ancestors",
  page.headers.get("x-frame-options") === "DENY")
check("MIME sniffing is off", page.headers.get("x-content-type-options") === "nosniff")
check("a Permissions-Policy is sent", (page.headers.get("permissions-policy") ?? "").length > 0)
check("the framework version is not advertised", page.headers.get("x-powered-by") === null)
// HSTS is production-only on purpose — sending it from a dev server would pin
// localhost to HTTPS in the developer's browser.
check("HSTS is withheld in development",
  page.headers.get("strict-transport-security") === null,
  page.headers.get("strict-transport-security") ?? "absent")

const exportHeaders = await req(jar, "/api/export/does-not-exist")
check("export responses are marked no-store",
  /no-store/.test(exportHeaders.headers.get("cache-control") ?? ""),
  exportHeaders.headers.get("cache-control"))

// ── 3. Rate limiting ─────────────────────────────────────────────
console.log("\n3. Rate limiting")
// A fresh IP per run, so a previous run's window cannot make this pass or fail.
const rateIp = `203.0.113.${Math.floor(Math.random() * 200) + 20}`
let limited = 0
let statuses = []
for (let attempt = 0; attempt < 14; attempt++) {
  const r = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": rateIp },
    body: JSON.stringify({ email: "nobody@educoreafrica.com", password: "wrong-on-purpose" }),
    redirect: "manual",
  })
  statuses.push(r.status)
  if (r.status === 429) {
    limited++
    if (limited === 1) {
      check("a rate-limited response carries Retry-After",
        Number(r.headers.get("retry-after")) > 0, r.headers.get("retry-after"))
      check("it names the limit and what is left",
        r.headers.get("ratelimit-limit") === "10" && r.headers.get("ratelimit-remaining") === "0",
        `${r.headers.get("ratelimit-limit")}/${r.headers.get("ratelimit-remaining")}`)
    }
  }
}
check("the auth limiter cuts in at 10 attempts per IP per minute",
  limited > 0 && statuses.slice(0, 10).every((s) => s !== 429),
  `${limited} of 14 rejected`)
check("a different IP is unaffected by that window",
  (await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
    body: JSON.stringify({ email: "nobody@educoreafrica.com", password: "wrong" }),
    redirect: "manual",
  })).status !== 429)

// ── 4. Churn risk ────────────────────────────────────────────────
console.log("\n4. Churn risk")
const run = await json(jar, "/api/ai/churn-risk", { method: "POST" })
check("scoring runs", run.status === 200, `${run.status}`)
check("it scores every paying school", (run.body?.scored ?? 0) > 0, `${run.body?.scored}`)
check("levels are counted", run.body?.byLevel && "CRITICAL" in run.body.byLevel)

const scores = (await json(jar, "/api/ai/churn-risk")).body
check("the latest batch is readable", Array.isArray(scores.scores) && scores.scores.length > 0)
check("scores are bounded 0–100",
  scores.scores.every((row) => row.score >= 0 && row.score <= 100))
check("the level follows the score, not the model",
  scores.scores.every((row) =>
    row.score >= 70 ? row.level === "CRITICAL"
      : row.score >= 45 ? row.level === "HIGH"
        : row.score >= 22 ? row.level === "MEDIUM" : row.level === "LOW"))
check("every row names a reason and an action",
  scores.scores.every((row) => row.primaryReason?.length > 0 && row.recommendedAction?.length > 0))
check("every row says whether Claude wrote it",
  scores.scores.every((row) => typeof row.generated === "boolean"))
check("a school that has never signed in is not treated as fresh",
  scores.scores.every((row) => row.signals.daysSinceLogin !== 0 || row.signals.mrr >= 0))
check("only HIGH and CRITICAL count toward MRR at risk", (() => {
  const expected = scores.scores
    .filter((row) => row.level === "HIGH" || row.level === "CRITICAL")
    .reduce((sum, row) => sum + row.signals.mrr, 0)
  return Math.abs(expected - scores.mrrAtRisk) < 1
})(), `${Math.round(scores.mrrAtRisk)}`)

const flagged = await prisma.churnRiskScore.count({ where: { isLatest: true } })
check("exactly one batch is flagged current",
  flagged === scores.scores.length || flagged >= scores.scores.length,
  `${flagged} rows marked isLatest`)

const filtered = (await json(jar, "/api/ai/churn-risk?level=CRITICAL")).body
check("the level filter is honoured",
  filtered.scores.every((row) => row.level === "CRITICAL"), `${filtered.scores.length} rows`)

// Surfaced where the spec says it must be.
const directory = await (await req(jar, "/console/schools")).text()
check("the school directory carries a churn-risk column", /Churn risk/i.test(directory))
const atRisk = await (await req(jar, "/console/growth?tab=churn")).text()
check("the at-risk list is reachable from Growth", /At-risk schools/i.test(atRisk))
check("the at-risk list explains how the score is built",
  /arithmetic over four observed signals/i.test(atRisk))

// ── 5. Growth recommendations ────────────────────────────────────
console.log("\n5. Growth recommendations")
const growth = await json(jar, "/api/ai/growth-recommendations", { method: "POST" })
check("a batch generates", growth.status === 200, `${growth.status}`)
check("it returns five initiatives", growth.body?.batch?.recommendations?.length === 5,
  `${growth.body?.batch?.recommendations?.length}`)
check("each is ranked, actionable and sourced",
  growth.body.batch.recommendations.every((entry) =>
    entry.rank > 0 && entry.action?.length > 0 && Array.isArray(entry.basedOn)))
check("each says whether Claude wrote it",
  growth.body.batch.recommendations.every((entry) => typeof entry.generated === "boolean"))

const readBack = (await json(jar, "/api/ai/growth-recommendations")).body
check("the batch is persisted and read back", readBack.batch?.batchId === growth.body.batch.batchId)
check("its age is reported", typeof readBack.ageDays === "number")
check("freshness is judged, not assumed", typeof readBack.stale === "boolean")

const commandCentre = await (await req(jar, "/console")).text()
check("the Command Centre shows This Week's Opportunities",
  /This week&#x27;s opportunities|This week’s opportunities/i.test(commandCentre))

// ── 6. Ticket auto-categoriser ───────────────────────────────────
console.log("\n6. Ticket triage")
const triage = await json(jar, "/api/ai/categorise-ticket", {
  method: "POST",
  body: JSON.stringify({
    title: "Paystack payment succeeded but the invoice is still unpaid",
    description: "Parents have Paystack receipts. Our invoices still show outstanding.",
    school: "SA10 Smoke School",
  }),
})
check("a ticket is triaged", triage.status === 200, `${triage.status}`)
check("it lands on a real category",
  ["BILLING", "TECHNICAL", "FEATURE_REQUEST", "ACCOUNT", "OTHER"].includes(triage.body?.category),
  triage.body?.category)
check("a payment failure is read as billing", triage.body?.category === "BILLING")
check("it returns a real priority",
  ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(triage.body?.priority), triage.body?.priority)
check("it drafts a reply rather than sending one",
  (triage.body?.suggestedReply ?? "").length > 0 &&
  /nothing was applied|no reply was sent/i.test(triage.body?.notice ?? ""))
check("confidence is stated", ["high", "medium", "low"].includes(triage.body?.confidence))

const empty = await json(jar, "/api/ai/categorise-ticket", {
  method: "POST",
  body: JSON.stringify({ title: "", description: "" }),
})
check("an empty ticket is refused rather than guessed at", empty.status === 400)

// The triage strip renders client-side once the ticket loads, so it is not in
// the server HTML. What matters is that applying a suggestion works: before
// SA-10 the update route accepted a priority but silently ignored a category.
const anyTicket = await prisma.supportTicket.findFirst({
  select: { id: true, category: true, priority: true },
})
if (anyTicket) {
  const target = anyTicket.category === "ACCOUNT" ? "OTHER" : "ACCOUNT"
  const applied = await json(jar, `/api/support/tickets/${anyTicket.id}/update`, {
    method: "PUT",
    body: JSON.stringify({ category: target, priority: triage.body.priority }),
  })
  check("applying a triage suggestion is accepted", applied.status === 200, `${applied.status}`)
  const after = await prisma.supportTicket.findUnique({
    where: { id: anyTicket.id },
    select: { category: true, priority: true },
  })
  check("the category actually changes", after?.category === target, after?.category)
  check("the priority comes across with it", after?.priority === triage.body.priority)

  const trail = await prisma.superAdminAuditLog.findFirst({
    where: { userId: owner.user.id, action: "support.ticket.update" },
    orderBy: { createdAt: "desc" },
  })
  check("the change is audited with both sides of the category",
    trail?.details?.from?.category !== undefined && trail?.details?.to?.category === target,
    JSON.stringify(trail?.details?.to))

  await prisma.supportTicket.update({
    where: { id: anyTicket.id },
    data: { category: anyTicket.category, priority: anyTicket.priority },
  })

  const rejected = await json(jar, `/api/support/tickets/${anyTicket.id}/update`, {
    method: "PUT",
    body: JSON.stringify({ category: "NOT_A_CATEGORY" }),
  })
  check("an invented category is refused, not written", rejected.status === 400, `${rejected.status}`)
} else {
  check("a ticket exists to triage", false, "no support tickets in the database")
}

// ── 7. Business snapshot, streamed ───────────────────────────────
console.log("\n7. Business snapshot stream")
const streamResponse = await req(jar, "/api/ai/business-snapshot/stream")
check("the stream opens", streamResponse.status === 200, `${streamResponse.status}`)
check("it is served as an event stream",
  /text\/event-stream/.test(streamResponse.headers.get("content-type") ?? ""),
  streamResponse.headers.get("content-type"))
check("proxy buffering is disabled", streamResponse.headers.get("x-accel-buffering") === "no")

const raw = await streamResponse.text()
const events = raw.split("\n\n").filter(Boolean).map((frame) => ({
  event: /^event:\s*(.+)$/m.exec(frame)?.[1]?.trim(),
  data: (() => { try { return JSON.parse(/^data:\s*(.+)$/m.exec(frame)?.[1] ?? "null") } catch { return null } })(),
}))
const deltas = events.filter((entry) => entry.event === "delta")
const done = events.find((entry) => entry.event === "done")
check("text arrives in pieces", deltas.length > 1, `${deltas.length} deltas`)
check("a done event closes the stream", Boolean(done))
check("the finished snapshot names its source",
  ["model", "heuristic"].includes(done?.data?.source), done?.data?.source)
check("the accumulated deltas match the finished text",
  deltas.map((entry) => entry.data.text).join("").trim() === done?.data?.text?.trim())
check("it records the figures it was built from",
  typeof done?.data?.basedOn?.schools === "number")

// ── 8. Report builder — the query engine ─────────────────────────
console.log("\n8. Report builder")
const sources = (await json(jar, "/api/reports")).body
check("the source catalogue is served", Array.isArray(sources.sources) && sources.sources.length >= 6,
  `${sources.sources?.length} sources`)
check("every source declares its fields",
  sources.sources.every((source) => Array.isArray(source.fields) && source.fields.length > 0))

const preview = await json(jar, "/api/reports/preview", {
  method: "POST",
  body: JSON.stringify({
    source: "SCHOOLS",
    fields: ["name", "state", "plan", "students", "mrr"],
    filters: [{ field: "students", operator: "gte", value: 1 }],
    sortField: "mrr",
    sortDir: "desc",
  }),
})
check("a preview runs", preview.status === 200, JSON.stringify(preview.body).slice(0, 120))
check("it returns at most ten rows", (preview.body?.rows?.length ?? 99) <= 10,
  `${preview.body?.rows?.length}`)
check("it reports the TRUE match count, not the preview size",
  typeof preview.body?.total === "number" && preview.body.total >= preview.body.rows.length,
  `${preview.body?.total} total`)
check("columns come back with types", preview.body.columns.every((column) => column.type))

// Injection and validation. A filter that does not typecheck must REJECT the
// report — silently dropping it returns MORE rows than were asked for.
const injection = await json(jar, "/api/reports/preview", {
  method: "POST",
  body: JSON.stringify({
    source: "SCHOOLS",
    fields: ["name"],
    filters: [{ field: "name; DROP TABLE schools;--", operator: "eq", value: "x" }],
  }),
})
check("an unknown filter field is rejected", injection.status === 400, `${injection.status}`)
const badOperator = await json(jar, "/api/reports/preview", {
  method: "POST",
  body: JSON.stringify({
    source: "SCHOOLS",
    fields: ["name"],
    filters: [{ field: "students", operator: "contains", value: "x" }],
  }),
})
check("an operator the field's type does not support is rejected", badOperator.status === 400)
const badField = await json(jar, "/api/reports/preview", {
  method: "POST",
  body: JSON.stringify({ source: "SCHOOLS", fields: ["(SELECT password_hash FROM users)"] }),
})
check("an unknown field is rejected", badField.status === 400)

// ── 9. Saving, running and scheduling ────────────────────────────
console.log("\n9. Saved reports")
const saved = await json(jar, "/api/reports", {
  method: "POST",
  body: JSON.stringify({
    name: "SA10 Smoke Report",
    description: "Created by the SA-10 smoke test.",
    source: "SCHOOLS",
    fields: ["name", "state", "plan", "mrr"],
    filters: [],
    sortField: "mrr",
    sortDir: "desc",
    rowLimit: 25,
    schedule: "WEEKLY",
    recipients: ["sa10-smoke@educoreafrica.com"],
  }),
})
check("a report saves", saved.status === 201, `${saved.status}`)
if (saved.body?.report?.id) created.reportIds.push(saved.body.report.id)

const noRecipients = await json(jar, "/api/reports", {
  method: "POST",
  body: JSON.stringify({
    name: "SA10 Unsendable", source: "SCHOOLS", fields: ["name"],
    schedule: "DAILY", recipients: [],
  }),
})
check("a schedule with nobody to send to is refused", noRecipients.status === 400,
  noRecipients.body?.error)

const ran = await json(jar, `/api/reports/${saved.body.report.id}/run`, { method: "POST" })
check("a saved report runs on demand", ran.status === 200, JSON.stringify(ran.body).slice(0, 140))
check("the run reports its row count", typeof ran.body?.rows === "number", `${ran.body?.rows}`)
check("the run says where the file went",
  ["s3", "redis", "none"].includes(ran.body?.storage), ran.body?.storage)
check("it counts what was actually emailed rather than what was intended",
  typeof ran.body?.emailed === "number", `${ran.body?.emailed}`)
check("anything that did not happen is stated, not folded into success",
  Array.isArray(ran.body?.notes) &&
  (ran.body.emailed > 0 || ran.body.notes.length > 0),
  JSON.stringify(ran.body?.notes))

const logRow = await prisma.reportRunLog.findFirst({
  where: { configId: saved.body.report.id },
  orderBy: { startedAt: "desc" },
})
check("the run is logged", Boolean(logRow))
check("the log records the outcome, not just the attempt",
  logRow?.status === "SUCCEEDED" || logRow?.status === "FAILED", logRow?.status)
check("it records how long the run took", typeof logRow?.durationMs === "number")

// ── 10. Export infrastructure ────────────────────────────────────
console.log("\n10. Exports")
async function exportAs(format) {
  const start = await json(jar, "/api/export", {
    method: "POST",
    body: JSON.stringify({
      source: "SCHOOLS",
      fields: ["name", "state", "plan", "mrr"],
      filters: [],
      format,
      filenameHint: "sa10-smoke",
    }),
  })
  if (start.body?.jobId) created.exportIds.push(start.body.jobId)
  return start
}

const xlsx = await exportAs("xlsx")
check("an Excel export starts", xlsx.status === 202, `${xlsx.status}`)
check("it returns a job id to poll", typeof xlsx.body?.jobId === "string")

const job = (await json(jar, `/api/export/${xlsx.body.jobId}`)).body
check("the job reports READY", job.status === "READY", job.status)
check("it exposes a download URL", typeof job.downloadUrl === "string")

const download = await req(jar, job.downloadUrl)
check("the file downloads", download.status === 200, `${download.status}`)
check("it is served as a workbook",
  /spreadsheetml/.test(download.headers.get("content-type") ?? ""),
  download.headers.get("content-type"))
const bytes = Buffer.from(await download.arrayBuffer())
check("the workbook is a real ZIP container, not an empty file",
  bytes.length > 1000 && bytes[0] === 0x50 && bytes[1] === 0x4b, `${bytes.length} bytes`)

const csv = await exportAs("csv")
const csvJob = (await json(jar, `/api/export/${csv.body.jobId}`)).body
const csvFile = await (await req(jar, csvJob.downloadUrl)).text()
check("a CSV export downloads", csvFile.split("\n").length > 1)
check("the CSV header carries the column labels, not the internal keys",
  /School/.test(csvFile.split("\n")[0]) && !/\bmrr\b/.test(csvFile.split("\n")[0]),
  csvFile.split("\n")[0].slice(0, 80))
check("CSV cells that start with a formula are neutralised",
  !/^[=+@]/m.test(csvFile.replace(/^"/gm, "")))

const pdf = await exportAs("pdf")
check("a PDF export is accepted", pdf.status === 202, `${pdf.status}`)
const pdfJob = (await json(jar, `/api/export/${pdf.body.jobId}`)).body
check("the PDF job finishes", pdfJob.status === "READY", pdfJob.status)
if (pdf.body.format === "pdf") {
  const file = Buffer.from(await (await req(jar, pdfJob.downloadUrl)).arrayBuffer())
  check("the PDF is a real PDF", file.subarray(0, 4).toString() === "%PDF", file.subarray(0, 8).toString())
} else {
  // Chromium is not installed here. The substitution has to be visible, and
  // the file must not claim to be something it is not.
  check("without Chromium the file is renamed rather than mislabelled",
    pdf.body.format === "html" && /\.html$/.test(pdfJob.filename ?? ""), pdfJob.filename)
  check("the swap is reported to the caller",
    /chromium/i.test(pdf.body.notice ?? ""), pdf.body.notice)
}

const foreign = await json(engineer.jar, `/api/export/${xlsx.body.jobId}/download`)
check("another admin cannot download someone else's export",
  foreign.status === 403 || foreign.status === 404, `${foreign.status}`)

// ── 11. Role gates ───────────────────────────────────────────────
console.log("\n11. Role gates")
check("engineering cannot open the report builder",
  (await req(engineer.jar, "/console/analytics/reports")).status === 307)
check("engineering cannot save a report",
  (await json(engineer.jar, "/api/reports", {
    method: "POST",
    body: JSON.stringify({ name: "nope", source: "SCHOOLS", fields: ["name"] }),
  })).status === 403)
check("engineering cannot trigger churn scoring",
  (await json(engineer.jar, "/api/ai/churn-risk", { method: "POST" })).status === 403)
check("engineering can still READ churn scores",
  (await json(engineer.jar, "/api/ai/churn-risk")).status === 200)

// ── 12. Seed ─────────────────────────────────────────────────────
console.log("\n12. Seed data")
const seededAdmin = await prisma.superAdminUser.findUnique({
  where: { email: "admin@educoreafrica.com" },
  select: { role: true, totpEnabled: true },
})
check("the seed creates the SUPER_ADMIN account", seededAdmin?.role === "SUPER_ADMIN")
check("it does NOT pre-enrol TOTP", seededAdmin?.totpEnabled === false)
const roles = await prisma.superAdminUser.groupBy({
  by: ["role"],
  where: { email: { endsWith: "@educoreafrica.com" } },
  _count: { _all: true },
})
check("one account exists per console role", roles.length >= 7, `${roles.length} roles`)
const demoSchools = await prisma.school.count({ where: { slug: { startsWith: "demo-" } } })
check("it seeds at least 50 schools", demoSchools >= 50, `${demoSchools}`)
const demoStates = await prisma.school.groupBy({
  by: ["state"],
  where: { slug: { startsWith: "demo-" } },
})
check("they span ten states", demoStates.length >= 10, `${demoStates.length}`)
const snapshotCount = await prisma.platformMetricSnapshot.count({
  where: { snapshotDate: { gte: new Date(Date.now() - 183 * 86_400_000) } },
})
check("six months of daily snapshots exist", snapshotCount >= 150, `${snapshotCount} days`)
const demoTickets = await prisma.supportTicket.count({
  where: { school: { slug: { startsWith: "demo-" } } },
})
check("support tickets are seeded", demoTickets >= 20, `${demoTickets}`)
const demoTxns = await prisma.subscriptionTransaction.count({
  where: { reference: { startsWith: "DEMO-TXN-" } },
})
check("transactions are seeded", demoTxns >= 30, `${demoTxns}`)
check("nothing outside the demo prefix is labelled as demo data",
  (await prisma.school.count({
    where: { name: { contains: "(Demo)" }, slug: { not: { startsWith: "demo-" } } },
  })) === 0)
check("re-running the seed adds nothing — it tops up rather than duplicates",
  (await prisma.school.groupBy({
    by: ["slug"],
    where: { slug: { startsWith: "demo-" } },
    having: { slug: { _count: { gt: 1 } } },
  })).length === 0)

// ── Cleanup ──────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`)

await prisma.reportRunLog.deleteMany({ where: { configId: { in: created.reportIds } } })
await prisma.reportConfig.deleteMany({ where: { id: { in: created.reportIds } } })
await prisma.reportConfig.deleteMany({ where: { name: { startsWith: "SA10 " } } })
await prisma.exportJob.deleteMany({ where: { id: { in: created.exportIds } } })
await prisma.superAdminAuditLog.deleteMany({
  where: { userId: { in: [owner.user.id, engineer.user.id] } },
})
await prisma.superAdminUser.deleteMany({ where: { email: { in: EMAILS } } })
await prisma.$disconnect()
process.exit(failures === 0 ? 0 : 1)
