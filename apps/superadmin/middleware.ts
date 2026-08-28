import NextAuth from "next-auth"
import { NextResponse } from "next/server"

import { SESSION_COOKIE, authConfig } from "@/auth.config"

// Edge-safe NextAuth instance — no Prisma, no bcrypt.
const { auth } = NextAuth(authConfig)

const PUBLIC_PREFIXES = [
  "/login",
  "/mfa",
  "/enroll-mfa",
  "/denied",
  "/api/auth",
  "/_next",
  "/favicon",
]

// Liveness probes. Exempt from BOTH the session check and the IP allowlist —
// the container runtime and load balancer that call them are not on the office
// network, and they report nothing beyond up/down.
//
// /api/health is canonical; /api/system/health predates it and stays as an
// alias because the SA-03 shell checks already use it.
const HEALTH_PATHS = ["/api/health", "/api/system/health"]

// Writes the audit row and returns the 403 body. Middleware runs on the edge
// runtime, where Prisma and ioredis are unavailable, so the block is decided
// here and *recorded* by rewriting into this Node route.
const BLOCKED_ROUTE = "/api/internal/ip-blocked"

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

// Edge duplicate of lib/ip's matcher — middleware must not import anything
// that reaches for node:crypto, Prisma or ioredis.
function globalAllowlist(): string[] {
  return (process.env.ALLOWED_IPS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function allowedByGlobalList(ip: string): boolean {
  const allowlist = globalAllowlist()
  if (allowlist.includes("*")) return true
  // Empty list: permissive in dev, deny-all in production.
  if (allowlist.length === 0) return process.env.NODE_ENV !== "production"
  return allowlist.some((entry) => (entry.endsWith(".") ? ip.startsWith(entry) : entry === ip))
}

export default auth((req) => {
  const { nextUrl } = req
  const pathname = nextUrl.pathname

  if (HEALTH_PATHS.includes(pathname) || pathname === BLOCKED_ROUTE) return NextResponse.next()

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"

  // ── IP allowlist ────────────────────────────────────────────────
  // The rule is "blocked only if the IP is in neither the user's own list nor
  // the global one". The per-user list lives in Postgres (Redis-cached), which
  // the edge runtime cannot read — so a request that already carries a session
  // cookie is passed through to lib/session-guard, which applies BOTH lists
  // and blocks + audits there. Nothing reaches data without one of the two
  // checks running.
  const hasSessionCookie =
    req.cookies.has(SESSION_COOKIE) || req.cookies.has(`__Secure-${SESSION_COOKIE}`)

  if (!allowedByGlobalList(ip) && !hasSessionCookie) {
    const url = nextUrl.clone()
    url.pathname = BLOCKED_ROUTE
    url.search = ""

    // Query params added to a rewrite target do not reach the handler, so the
    // original path rides along as a header instead.
    const headers = new Headers(req.headers)
    headers.set("x-blocked-path", pathname)

    return NextResponse.rewrite(url, { request: { headers } })
  }

  if (isPublic(pathname)) return NextResponse.next()

  if (!req.auth?.user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const login = new URL("/login", nextUrl)
    login.searchParams.set("callbackUrl", pathname + nextUrl.search)
    return NextResponse.redirect(login)
  }

  // Session-row checks (revocation, 30-minute idle, 8-hour ceiling, per-user
  // IP) all need the database, so they live in lib/session-guard and run in
  // the console layout and every route handler. Middleware only proves the
  // cookie is well-formed and unexpired as a JWT.
  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
}
