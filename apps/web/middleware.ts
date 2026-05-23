import NextAuth from "next-auth"
import { NextResponse, type NextRequest } from "next/server"
import { authConfig } from "@/auth.config"

// Edge-safe NextAuth instance (no Prisma).
const { auth } = NextAuth(authConfig)

type Role =
  | "SUPER_ADMIN"
  | "SCHOOL_ADMIN"
  | "PRINCIPAL"
  | "TEACHER"
  | "BURSAR"
  | "COUNSELOR"
  | "STUDENT"
  | "PARENT"
  | "LIBRARIAN"
  | "HOSTEL_MASTER"
  | "DRIVER"

// Route → allowed roles. SUPER_ADMIN bypasses all per-route checks below.
const ROLE_RULES: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/dashboard/finance", roles: ["BURSAR", "SCHOOL_ADMIN", "PRINCIPAL"] },
  {
    prefix: "/dashboard/staff",
    roles: ["SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "BURSAR", "COUNSELOR"],
  },
  { prefix: "/dashboard/ai", roles: ["TEACHER", "PRINCIPAL", "SCHOOL_ADMIN"] },
]

// Routes accessible without auth. Matches by prefix.
// /api/cron is allowed through because the routes self-authenticate via CRON_SECRET.
// /report-cards is allowed through because the routes self-authenticate via opaque
// share tokens (see app/report-cards/[token]/route.ts).
const PUBLIC_PREFIXES = [
  "/auth",
  "/onboard",
  "/api/auth",
  "/api/webhooks",
  "/api/cron",
  "/report-cards",
  "/_next",
  "/favicon",
]

function isPublic(pathname: string) {
  if (pathname === "/") return true
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
}

export default auth((req) => {
  const { nextUrl } = req
  const pathname = nextUrl.pathname
  const isAuthed = !!req.auth?.user

  if (isPublic(pathname)) {
    // Pass schoolId header through for public API routes that still want it.
    return NextResponse.next()
  }

  if (!isAuthed) {
    // API routes get JSON 401 — they shouldn't render the login page.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const login = new URL("/auth/login", nextUrl)
    login.searchParams.set("callbackUrl", pathname + nextUrl.search)
    return NextResponse.redirect(login)
  }

  const user = req.auth!.user
  const role = user.role as Role

  // Role-gated dashboard subroutes. SUPER_ADMIN can see everything.
  if (role !== "SUPER_ADMIN") {
    for (const rule of ROLE_RULES) {
      if (pathname.startsWith(rule.prefix) && !rule.roles.includes(role)) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
        return NextResponse.redirect(new URL("/dashboard?forbidden=1", nextUrl))
      }
    }
  }

  // Forward tenant context as a request header so server components / route
  // handlers downstream don't have to re-decode the JWT.
  const headers = new Headers(req.headers)
  if (user.schoolId) headers.set("x-school-id", user.schoolId)
  headers.set("x-user-id", user.id)
  headers.set("x-user-role", role)

  return NextResponse.next({ request: { headers } })
})

export const config = {
  // Skip Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
}
