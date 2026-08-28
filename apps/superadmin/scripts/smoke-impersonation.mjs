// Cross-app impersonation check.
//
//   pnpm --filter superadmin dev              # console on :3001
//   pnpm --filter web dev                     # school app on :3000
//   pnpm --filter superadmin test:impersonation
//
// Verifies that a grant minted in the console opens the school app read-only,
// that every write is refused, and that revoking the grant takes effect at
// once. Needs BOTH servers, a real database and demo data.
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import * as OTPAuth from "otpauth"

const CONSOLE = "http://localhost:3001"
const SCHOOL = "http://localhost:3000"
const EMAIL = "sa-imp@educoreafrica.com"
const PASSWORD = "ImpCheck!2026"
const prisma = new PrismaClient()
let failures = 0
const check = (n, ok, x = "") => { if (!ok) failures++; console.log(`  [${ok ? "PASS" : "FAIL"}] ${n}${x ? ` — ${x}` : ""}`) }

function jarFor() {
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

async function req(base, path, jar, init = {}) {
  const r = await fetch(base + path, {
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

await prisma.superAdminUser.deleteMany({ where: { email: EMAIL } })
await prisma.superAdminUser.create({
  data: { email: EMAIL, name: "Imp Checker", role: "SUPPORT_ADMIN", passwordHash: await bcrypt.hash(PASSWORD, 10) },
})

const consoleJar = jarFor()
await req(CONSOLE, "/api/auth/signin", consoleJar, { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
const enroll = await (await req(CONSOLE, "/api/auth/totp/enroll", consoleJar, { method: "POST" })).json()
const totp = new OTPAuth.TOTP({ issuer: "EduCore Africa Console", label: EMAIL, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(enroll.secret) })
for (let attempt = 0; attempt < 4; attempt++) {
  // A code generated just before a window boundary is stale by the time it
  // lands, so retry across windows rather than make every run a coin flip.
  const confirmed = await req(CONSOLE, "/api/auth/totp/confirm", consoleJar, {
    method: "POST",
    body: JSON.stringify({ code: totp.generate() }),
  })
  if (confirmed.status === 200) break
  await new Promise((resolve) => setTimeout(resolve, 2500))
}
check("console session", consoleJar.has("educore-sa.session-token"))

const school = await prisma.school.findFirst({ where: { slug: { startsWith: "demo-" } }, select: { id: true, name: true } })
if (!school) {
  console.log("  [skip] no demo schools — run `pnpm seed:demo` first")
  await prisma.$disconnect()
  process.exit(0)
}

console.log("\nSchool app before impersonation")
const anon = jarFor()
const anonDash = await req(SCHOOL, "/dashboard", anon, {})
check("anonymous /dashboard redirects to login", anonDash.status === 307 && (anonDash.headers.get("location") ?? "").includes("/auth/login"), `${anonDash.status}`)

console.log("\nStarting the support session")
const grantRes = await req(CONSOLE, `/api/schools/${school.id}/impersonate`, consoleJar, { method: "POST", body: JSON.stringify({ reason: "cross-app check" }) })
const grant = await grantRes.json()
check("grant minted", grantRes.status === 200 && grant.redirectUrl.startsWith(SCHOOL))

const schoolJar = jarFor()
const accept = await req(SCHOOL, grant.redirectUrl.replace(SCHOOL, ""), schoolJar, {})
check("accept redirects to the dashboard", accept.status === 307 && (accept.headers.get("location") ?? "").includes("/dashboard"))
check("impersonation cookie set", schoolJar.has("educore.impersonation"))
check("token not left in the redirect target", !(accept.headers.get("location") ?? "").includes("token="))

console.log("\nRead-only behaviour")
const dash = await req(SCHOOL, "/dashboard", schoolJar, {})
const dashHtml = await dash.text()
check("dashboard renders without a school login", dash.status === 200, `${dash.status}`)
check("banner names the school", dashHtml.includes("Viewing as EduCore Support") && dashHtml.includes(school.name))
check("banner says read-only", dashHtml.includes("Read-only"))
check("exit link present", dashHtml.includes("/api/impersonation/exit"))

for (const [method, path] of [["POST", "/api/students"], ["PUT", "/api/students"], ["DELETE", "/api/students"], ["PATCH", "/dashboard"]]) {
  const r = await req(SCHOOL, path, schoolJar, { method, body: method === "DELETE" ? undefined : JSON.stringify({}) })
  const body = await r.text()
  check(`${method} ${path} blocked`, r.status === 403 && body.includes("read-only"), `${r.status}`)
}

const getOk = await req(SCHOOL, "/dashboard/students", schoolJar, {})
check("GET pages still work", getOk.status === 200 || getOk.status === 307, `${getOk.status}`)

console.log("\nRevocation takes effect immediately")
await req(CONSOLE, "/api/impersonation/end", consoleJar, { method: "POST", body: JSON.stringify({ grantId: grant.grantId }) })
const afterEnd = await req(SCHOOL, "/dashboard", schoolJar, {})
check("dashboard bounces once the grant is ended", afterEnd.status === 307 && (afterEnd.headers.get("location") ?? "").includes("/auth/login"))

const audits = await prisma.superAdminAuditLog.findMany({
  where: { target: `school:${school.id}`, action: { in: ["IMPERSONATION_START", "IMPERSONATION_END"] } },
  select: { action: true },
})
check("both events audited", audits.some((a) => a.action === "IMPERSONATION_START") && audits.some((a) => a.action === "IMPERSONATION_END"))

console.log(`\n${failures === 0 ? "ALL CROSS-APP CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`)
await prisma.superAdminUser.deleteMany({ where: { email: EMAIL } })
await prisma.$disconnect()
process.exit(failures === 0 ? 0 : 1)
