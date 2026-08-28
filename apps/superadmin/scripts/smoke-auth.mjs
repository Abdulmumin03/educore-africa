// SA-01 end-to-end auth check.
//
//   pnpm --filter superadmin dev          # in one terminal
//   pnpm --filter superadmin test:auth    # in another
//
// Unlike the vitest suite this needs a RUNNING SERVER and a real database: it
// drives the actual HTTP endpoints with a cookie jar and asserts against the
// session and audit rows that come out the other end. It creates and deletes
// its own throwaway account, so it is safe to re-run.
import { PrismaClient } from "@prisma/client"
import Redis from "ioredis"
import * as OTPAuth from "otpauth"

const BASE = "http://localhost:3001"
const EMAIL = "sa-smoke@educoreafrica.com"
const PASSWORD = "SmokeTest!2026"
const prisma = new PrismaClient()
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { keyPrefix: "sa:" })

// The console caches each user's allowlist in Redis for 5 minutes. Editing
// the row straight from here bypasses lib/ip's invalidateUserAllowlist, which
// the admin screens call — so do the same thing by hand.
async function setAllowlist(userId, allowedIPs) {
  await prisma.superAdminUser.update({ where: { id: userId }, data: { allowedIPs } })
  await redis.del(`allowed-ips:${userId}`)
}

let failures = 0
function check(name, condition, extra = "") {
  const status = condition ? "PASS" : "FAIL"
  if (!condition) failures++
  console.log(`  [${status}] ${name}${extra ? ` — ${extra}` : ""}`)
}

class Jar {
  constructor() { this.cookies = new Map() }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ")
  }
  absorb(response) {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";")
      const index = pair.indexOf("=")
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      if (value === "") this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }
  has(name) { return this.cookies.has(name) }
}

async function call(jar, path, { method = "GET", body, ip = "127.0.0.1" } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": "sa-smoke/1.0 (Chrome; Windows)",
      ...(jar.header() ? { cookie: jar.header() } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  })
  jar.absorb(response)
  let payload = null
  try { payload = await response.json() } catch { /* html or empty */ }
  return { status: response.status, payload }
}

function code(secret, offsetSeconds = 0) {
  return new OTPAuth.TOTP({
    issuer: "EduCore Africa Console",
    label: EMAIL,
    algorithm: "SHA1", digits: 6, period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate({ timestamp: Date.now() + offsetSeconds * 1000 })
}

const auditFor = (userId, action) =>
  prisma.superAdminAuditLog.count({ where: { userId, action } })

async function main() {
  // Clean slate.
  await prisma.superAdminUser.deleteMany({ where: { email: EMAIL } })
  const bcrypt = (await import("bcryptjs")).default
  const user = await prisma.superAdminUser.create({
    data: {
      email: EMAIL,
      name: "Smoke Tester",
      role: "SUPER_ADMIN",
      passwordHash: await bcrypt.hash(PASSWORD, 10),
    },
  })

  // ── 1. Forced TOTP enrolment ─────────────────────────────────────
  console.log("\n1. New account is forced to enrol TOTP")
  const jar = new Jar()
  let res = await call(jar, "/api/auth/signin", { method: "POST", body: { email: EMAIL, password: PASSWORD } })
  check("signin returns 200", res.status === 200, `got ${res.status}`)
  check("routed to /enroll-mfa", res.payload?.next === "/enroll-mfa", JSON.stringify(res.payload))
  check("no session cookie yet", !jar.has("educore-sa.session-token"))
  check("LOGIN_SUCCESS audited", (await auditFor(user.id, "LOGIN_SUCCESS")) === 1)

  res = await call(jar, "/api/auth/totp/enroll", { method: "POST" })
  check("enroll returns a secret + QR", Boolean(res.payload?.secret && res.payload?.qrDataUrl?.startsWith("data:image/png")))
  const secret = res.payload.secret

  const fresh = await prisma.superAdminUser.findUnique({ where: { id: user.id } })
  check("secret NOT written before confirmation", fresh.totpSecret === null && fresh.totpEnabled === false)

  res = await call(jar, "/api/auth/totp/confirm", { method: "POST", body: { code: "000000" } })
  check("wrong enrolment code rejected", res.status === 401, `got ${res.status}`)

  res = await call(jar, "/api/auth/totp/confirm", { method: "POST", body: { code: code(secret) } })
  check("confirm returns 8 backup codes", res.payload?.backupCodes?.length === 8)
  check("confirm signs the user straight in", res.payload?.next === "/console")
  check("session cookie issued", jar.has("educore-sa.session-token"))
  check("MFA_ENROLLED audited", (await auditFor(user.id, "MFA_ENROLLED")) === 1)
  const backupCodes = res.payload.backupCodes

  const enrolled = await prisma.superAdminUser.findUnique({ where: { id: user.id } })
  check("secret stored encrypted", enrolled.totpSecret?.startsWith("enc:v1:") === true)
  check("totpEnabled flipped", enrolled.totpEnabled === true)

  // ── 2. /api/auth/me + sliding session ────────────────────────────
  console.log("\n2. Session introspection")
  res = await call(jar, "/api/auth/me")
  check("me returns the account", res.payload?.user?.email === EMAIL, JSON.stringify(res.payload).slice(0, 120))
  check("me reports 8 backup codes left", res.payload?.user?.backupCodesRemaining === 8)
  const idleGap = new Date(res.payload.session.idleExpiresAt) - Date.now()
  check("idle window is ~30 min", idleGap > 28 * 60_000 && idleGap <= 30 * 60_000, `${Math.round(idleGap / 60_000)} min`)
  const absGap = new Date(res.payload.session.absoluteExpiresAt) - Date.now()
  check("absolute ceiling is ~8 h", absGap > 7.9 * 3600_000 && absGap <= 8 * 3600_000, `${(absGap / 3600_000).toFixed(1)} h`)

  // ── 3. Logout revokes the row ────────────────────────────────────
  console.log("\n3. Logout")
  res = await call(jar, "/api/auth/logout", { method: "POST" })
  check("logout ok", res.status === 200 && res.payload?.ok === true)
  check("session cookie cleared", !jar.has("educore-sa.session-token"))
  check("LOGOUT audited", (await auditFor(user.id, "LOGOUT")) === 1)
  const revoked = await prisma.superAdminSession.count({ where: { userId: user.id, revokedReason: "logout" } })
  check("session row revoked", revoked === 1)
  res = await call(jar, "/api/auth/me")
  check("me now 401", res.status === 401, `got ${res.status}`)

  // ── 4. Normal password + TOTP login ──────────────────────────────
  console.log("\n4. Password + TOTP login")
  const jar2 = new Jar()
  res = await call(jar2, "/api/auth/signin", { method: "POST", body: { email: EMAIL, password: PASSWORD } })
  check("routed to /mfa", res.payload?.next === "/mfa", JSON.stringify(res.payload))
  check("challenge cookie set", jar2.has("educore-sa.mfa-challenge"))

  res = await call(jar2, "/api/auth/verify-mfa", { method: "POST", body: { otp: "000000" } })
  check("wrong code rejected", res.status === 401)
  check("MFA_FAILED audited", (await auditFor(user.id, "MFA_FAILED")) >= 1)
  check("challenge survives a wrong code", jar2.has("educore-sa.mfa-challenge"))

  res = await call(jar2, "/api/auth/verify-mfa", { method: "POST", body: { otp: code(secret) } })
  check("correct code accepted", res.status === 200 && res.payload?.next === "/console", JSON.stringify(res.payload))
  check("session cookie issued", jar2.has("educore-sa.session-token"))
  check("failed counter cleared on success", (await prisma.superAdminUser.findUnique({ where: { id: user.id } })).failedLoginAttempts === 0)

  // ── 5. Backup code login ─────────────────────────────────────────
  console.log("\n5. Backup code login")
  const jar3 = new Jar()
  await call(jar3, "/api/auth/signin", { method: "POST", body: { email: EMAIL, password: PASSWORD } })
  res = await call(jar3, "/api/auth/verify-mfa", { method: "POST", body: { otp: backupCodes[0] } })
  check("backup code accepted", res.status === 200, JSON.stringify(res.payload))
  check("BACKUP_CODE_USED audited", (await auditFor(user.id, "BACKUP_CODE_USED")) === 1)

  const jar4 = new Jar()
  await call(jar4, "/api/auth/signin", { method: "POST", body: { email: EMAIL, password: PASSWORD } })
  res = await call(jar4, "/api/auth/verify-mfa", { method: "POST", body: { otp: backupCodes[0] } })
  check("same backup code cannot be reused", res.status === 401)
  await prisma.superAdminUser.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })

  // ── 6. Concurrent session cap ────────────────────────────────────
  console.log("\n6. Concurrent sessions capped at 2")
  const live = () => prisma.superAdminSession.count({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
  })
  check("two live sessions so far", (await live()) === 2, `${await live()}`)

  const jar5 = new Jar()
  await call(jar5, "/api/auth/signin", { method: "POST", body: { email: EMAIL, password: PASSWORD } })
  await call(jar5, "/api/auth/verify-mfa", { method: "POST", body: { otp: code(secret) } })
  check("still only two after a third login", (await live()) === 2, `${await live()}`)
  check("oldest revoked as concurrent-limit",
    (await prisma.superAdminSession.count({ where: { userId: user.id, revokedReason: "concurrent-limit" } })) === 1)
  res = await call(jar2, "/api/auth/me")
  check("the evicted session is now 401", res.status === 401, `got ${res.status}`)

  // ── 7. Trusted device ────────────────────────────────────────────
  console.log("\n7. Trust this device for 30 days")
  const jar6 = new Jar()
  await call(jar6, "/api/auth/signin", { method: "POST", body: { email: EMAIL, password: PASSWORD } })
  res = await call(jar6, "/api/auth/verify-mfa", { method: "POST", body: { otp: code(secret), trustDevice: true } })
  check("trust cookie issued", jar6.has("educore-sa.trusted-device"), JSON.stringify(res.payload))
  check("DEVICE_TRUSTED audited", (await auditFor(user.id, "DEVICE_TRUSTED")) === 1)

  await call(jar6, "/api/auth/logout", { method: "POST" })
  check("trust cookie survives logout", jar6.has("educore-sa.trusted-device"))
  res = await call(jar6, "/api/auth/signin", { method: "POST", body: { email: EMAIL, password: PASSWORD } })
  check("trusted device skips MFA", res.payload?.next === "/console" && res.payload?.trustedDevice === true, JSON.stringify(res.payload))
  check("session cookie issued without a code", jar6.has("educore-sa.session-token"))

  // ── 8. Idle + absolute expiry ────────────────────────────────────
  console.log("\n8. Session expiry")
  const jar7 = new Jar()
  await call(jar7, "/api/auth/signin", { method: "POST", body: { email: EMAIL, password: PASSWORD } })
  await call(jar7, "/api/auth/verify-mfa", { method: "POST", body: { otp: code(secret) } })
  const token = [...jar7.cookies].find(([k]) => k === "educore-sa.session-token")
  check("logged in", Boolean(token))

  const session = await prisma.superAdminSession.findFirst({
    where: { userId: user.id, revokedAt: null }, orderBy: { createdAt: "desc" },
  })
  await prisma.superAdminSession.update({
    where: { id: session.id },
    data: { expiresAt: new Date(Date.now() - 1000), lastActiveAt: new Date(Date.now() - 31 * 60_000) },
  })
  res = await call(jar7, "/api/auth/me")
  check("idle-expired session rejected", res.status === 401 && res.payload?.reason === "idle-expired", JSON.stringify(res.payload))
  check("SESSION_EXPIRED audited", (await auditFor(user.id, "SESSION_EXPIRED")) === 1)
  check("401 clears the cookie", !jar7.has("educore-sa.session-token"))

  // ── 9. Lockout after 5 failures ──────────────────────────────────
  console.log("\n9. Five failed logins lock the account for 15 minutes")
  await prisma.superAdminUser.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })
  const jar8 = new Jar()
  const statuses = []
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await call(jar8, "/api/auth/signin", { method: "POST", body: { email: EMAIL, password: "wrong" } })
    statuses.push(`${r.status}/${r.payload?.attemptsRemaining ?? "-"}`)
  }
  check("first four are 401, fifth is 423", statuses.slice(0, 4).every((s) => s.startsWith("401")) && statuses[4].startsWith("423"), statuses.join(" "))
  check("ACCOUNT_LOCKED audited", (await auditFor(user.id, "ACCOUNT_LOCKED")) === 1)

  res = await call(jar8, "/api/auth/signin", { method: "POST", body: { email: EMAIL, password: PASSWORD } })
  check("correct password rejected while locked", res.status === 423, `got ${res.status}`)
  const locked = await prisma.superAdminUser.findUnique({ where: { id: user.id } })
  const lockMinutes = Math.round((locked.lockedUntil - Date.now()) / 60_000)
  check("lock lasts ~15 minutes", lockMinutes >= 14 && lockMinutes <= 15, `${lockMinutes} min`)

  await prisma.superAdminUser.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } })

  // ── 10. Per-user IP allowlist ────────────────────────────────────
  console.log("\n10. Per-user IP allowlist")
  await setAllowlist(user.id, ["127.0.0.1"])
  const jar9 = new Jar()
  res = await call(jar9, "/api/auth/signin", { method: "POST", body: { email: EMAIL, password: PASSWORD }, ip: "8.8.8.8" })
  check("off-list IP gets 403", res.status === 403, `got ${res.status}`)
  check("documented error body", res.payload?.error === "Access denied: IP not allowed", JSON.stringify(res.payload))
  check("IP_BLOCKED audited", (await auditFor(user.id, "IP_BLOCKED")) >= 1)

  res = await call(jar9, "/api/auth/signin", { method: "POST", body: { email: EMAIL, password: PASSWORD }, ip: "127.0.0.1" })
  check("on-list IP still works", res.status === 200, `got ${res.status}`)

  // A live session that moves off-list is cut off mid-flight.
  await call(jar9, "/api/auth/verify-mfa", { method: "POST", body: { otp: code(secret) } })
  res = await call(jar9, "/api/auth/me", { ip: "8.8.8.8" })
  check("live session blocked from a new IP", res.status === 403 && res.payload?.reason === "ip-blocked", JSON.stringify(res.payload))

  await setAllowlist(user.id, [])

  // ── 11. Unknown email ────────────────────────────────────────────
  console.log("\n11. Unknown account")
  const before = await prisma.superAdminAuditLog.count({ where: { action: "LOGIN_FAILED", userId: null } })
  res = await call(new Jar(), "/api/auth/signin", { method: "POST", body: { email: "nobody@example.com", password: "x" } })
  check("generic 401", res.status === 401 && res.payload?.error === "Those credentials were not accepted.")
  const after = await prisma.superAdminAuditLog.count({ where: { action: "LOGIN_FAILED", userId: null } })
  check("LOGIN_FAILED audited with no user", after === before + 1)

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`)

  // Tidy up.
  await prisma.superAdminUser.deleteMany({ where: { email: EMAIL } })
  await prisma.superAdminAuditLog.deleteMany({ where: { userId: null, target: "email:nobody@example.com" } })
  await prisma.$disconnect()
  redis.disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await prisma.superAdminUser.deleteMany({ where: { email: EMAIL } }).catch(() => {})
  await prisma.$disconnect()
  redis.disconnect()
  process.exit(1)
})
