// SA-03 console shell check.
//
//   pnpm --filter superadmin dev           # in one terminal
//   pnpm --filter superadmin test:shell    # in another
//
// Needs a RUNNING SERVER and a real database. Signs in end to end, then
// asserts the rendered shell: dark theme, fixed 220/56 zones, grouped nav and
// its active state, breadcrumb, metric cards, the data table, the ⌘K search
// API and the notification feed. Creates and deletes its own account.
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import * as OTPAuth from "otpauth"

const BASE = "http://localhost:3001"
const EMAIL = "sa-shell@educoreafrica.com"
const PASSWORD = "ShellCheck!2026"
const prisma = new PrismaClient()
const jar = new Map()

let failures = 0
function check(name, ok, extra = "") {
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

await prisma.superAdminUser.deleteMany({ where: { email: EMAIL } })
const user = await prisma.superAdminUser.create({
  data: { email: EMAIL, name: "Shell Checker", role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(PASSWORD, 10) },
})

// Sign in (password → enrol TOTP → session).
await go("/api/auth/signin", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
const enroll = await (await go("/api/auth/totp/enroll", { method: "POST" })).json()
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

// ── Dark theme + shell chrome ──
console.log("\n1. Shell renders dark")
const home = await go("/console")
const html = await home.text()
check("/console 200", home.status === 200, `got ${home.status}`)
check("<html class=dark>", /<html[^>]+class="[^"]*dark/.test(html))
check("body carries sa-base", html.includes("bg-sa-base"))
const bodyTag = html.match(/<body[^>]*>/)?.[0] ?? ""
check("both font variables applied", (bodyTag.match(/__variable_[a-z0-9]+/g) ?? []).length === 2, bodyTag.slice(0, 90))
const cssHref = html.match(/href="(\/_next\/static\/css\/[^"]+)"/)?.[1]
const css = cssHref ? await (await go(cssHref)).text() : ""
check("--font-mono defined in CSS", css.includes("--font-mono"), cssHref ?? "no stylesheet link")
check(".tabular utility emitted", css.includes("tabular-nums"))
check("sidebar is 220px fixed", html.includes("w-sidebar") && html.includes("fixed inset-y-0"))
check("topbar is 56px fixed", html.includes("h-topbar") && html.includes("left-sidebar"))
check("main offset by both", html.includes("ml-sidebar") && html.includes("pt-topbar"))
check("Cmd+K hint rendered", html.includes("⌘K"))
check("nav groups present", ["Overview", "Business", "Operations", "Platform"].every((g) => html.includes(g)))
check("all 10 nav items", ["Command Centre", "Schools", "Revenue", "User Accounts", "Analytics",
  "Support", "Growth", "System Health", "Configuration", "Audit Log"].every((l) => html.includes(l)))
check("user card + role", html.includes("Shell Checker") && html.includes("super admin"))

// ── Active nav highlighting ──
console.log("\n2. Active nav state follows the route")
function activeLabel(markup) {
  const m = markup.match(/aria-current="page"[^>]*>(.*?)<\/a>/s)
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null
}
check("Command Centre active on /console", activeLabel(html) === "Command Centre", `${activeLabel(html)}`)
const schoolsHtml = await (await go("/console/schools")).text()
check("Schools active on /console/schools", activeLabel(schoolsHtml) === "Schools", `${activeLabel(schoolsHtml)}`)
check("active rail uses sa-blue", /aria-current="page"[^>]*class="[^"]*text-sa-blue/.test(schoolsHtml))

// ── Breadcrumb ──
console.log("\n3. Breadcrumb from the path")
check("root breadcrumb", html.includes(">Console<") && html.includes("Command Centre"))
const totpHtml = await (await go("/console/settings/security/totp")).text()
check("nested breadcrumb has Settings > Security", totpHtml.includes("Settings") && totpHtml.includes("Security"))

// ── Metric cards ──
console.log("\n4. Metric cards")
check("metric value is tabular+mono", html.includes("tabular text-metric"))
const schoolCount = await prisma.school.count({ where: { deletedAt: null } })
check("shows the real school count", html.includes(new Intl.NumberFormat("en-NG").format(schoolCount)), `${schoolCount}`)
check("trend arrow rendered", /lucide-arrow-(up|down)/.test(html) || html.includes("M12 19V5") || html.includes("M12 5v14"))
check("sparkline path rendered", /<svg[^>]*width="60"[^>]*height="24"/.test(html))

// ── Data table ──
console.log("\n5. Data table")
check("36px rows", schoolsHtml.includes("h-9 px-3"))
check("sortable headers", schoolsHtml.includes("ChevronsUpDown") || schoolsHtml.includes("lucide-chevrons-up-down") || schoolsHtml.includes("m7 15 5 5 5-5"))
check("sticky first column", schoolsHtml.includes("sticky left-0"))
check("pagination footer", /Showing/.test(schoolsHtml) && schoolsHtml.includes("Rows"))
const empty = schoolCount === 0
check(empty ? "empty state shown" : "rows rendered",
  empty ? schoolsHtml.includes("No schools yet") : /tabular/.test(schoolsHtml))

// ── Command palette search ──
console.log("\n6. ⌘K palette search")
const short = await (await go("/api/search?q=a")).json()
check("ignores 1-char queries", short.schools.length === 0 && short.users.length === 0)
const anySchool = await prisma.school.findFirst({ where: { deletedAt: null }, select: { name: true } })
if (anySchool) {
  const term = anySchool.name.slice(0, 4)
  const hits = await (await go(`/api/search?q=${encodeURIComponent(term)}`)).json()
  check("finds a school by name", hits.schools.some((s) => s.name === anySchool.name), `"${term}"`)
} else {
  console.log("  [skip] no schools in the database to search")
}
const anyUser = await prisma.user.findFirst({ where: { deletedAt: null }, select: { email: true } })
if (anyUser) {
  // Search on the FULL address: the endpoint returns at most 6 hits ordered by
  // email, and a prefix like "head." matches dozens of seeded accounts, so a
  // prefix search proves nothing about whether THIS user is findable.
  const hits = await (await go(`/api/search?q=${encodeURIComponent(anyUser.email)}`)).json()
  check("finds a user by email", hits.users.some((u) => u.email === anyUser.email), anyUser.email)
  const prefix = anyUser.email.slice(0, 5)
  const prefixHits = await (await go(`/api/search?q=${encodeURIComponent(prefix)}`)).json()
  check("prefix search returns only matches", prefixHits.users.length > 0 &&
    prefixHits.users.every((u) => u.email.toLowerCase().includes(prefix.toLowerCase())), `"${prefix}"`)
} else {
  console.log("  [skip] no school users in the database to search")
}
const unauth = await fetch(`${BASE}/api/search?q=lagos`, { headers: { "x-forwarded-for": "127.0.0.1" } })
check("search requires a session", unauth.status === 401, `got ${unauth.status}`)

// ── Notifications ──
console.log("\n7. Notifications")
let feed = await (await go("/api/notifications")).json()
check("returns a feed", Array.isArray(feed.notifications), JSON.stringify(feed).slice(0, 80))
check("every item is well formed", feed.notifications.every((n) =>
  n.id && n.type && n.message && n.link && n.createdAt && typeof n.isRead === "boolean"))
check("types are from the documented set", feed.notifications.every((n) =>
  ["school_signup", "payment_received", "ticket_opened", "system_alert"].includes(n.type)))
check("newest first", feed.notifications.every((n, i, a) => i === 0 || a[i - 1].createdAt >= n.createdAt))
check("at most 10", feed.notifications.length <= 10, `${feed.notifications.length}`)

// A blocked-IP audit row is a system_alert — make one and confirm it surfaces.
await prisma.superAdminAuditLog.create({
  data: { userId: user.id, action: "IP_BLOCKED", target: "ip:203.0.113.9", targetType: "system", ipAddress: "203.0.113.9" },
})
feed = await (await go("/api/notifications")).json()
const alert = feed.notifications.find((n) => n.type === "system_alert")
check("new alert appears unread", Boolean(alert) && alert.isRead === false, JSON.stringify(alert))
check("unread count > 0", feed.unreadCount > 0, `${feed.unreadCount}`)

const marked = await go("/api/notifications/read", { method: "PATCH" })
check("mark all read ok", marked.status === 200)
feed = await (await go("/api/notifications")).json()
check("unread count now 0", feed.unreadCount === 0, `${feed.unreadCount}`)
check("watermark persisted",
  (await prisma.superAdminUser.findUnique({ where: { id: user.id } })).notificationsReadAt !== null)

// ── Other shell pages ──
console.log("\n8. Shell pages")
for (const path of ["/console/settings/profile", "/console/docs", "/console/revenue", "/console/audit"]) {
  const r = await go(path)
  check(`${path} renders`, r.status === 200, `got ${r.status}`)
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`)
await prisma.superAdminUser.deleteMany({ where: { email: EMAIL } })
await prisma.$disconnect()
process.exit(failures === 0 ? 0 : 1)
