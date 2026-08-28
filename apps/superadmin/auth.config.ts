import type { SuperAdminRole } from "@prisma/client"
import type { NextAuthConfig } from "next-auth"

// Edge-safe config. NO Prisma, NO bcrypt, NO node-only imports — middleware
// pulls this in and runs it on the edge runtime.
//
// The secret is passed explicitly: Auth.js v5 otherwise looks for AUTH_SECRET,
// and the middleware would then fail to decrypt a cookie the Node runtime
// wrote (see the school app for the same footgun).
const RESOLVED_SECRET = process.env.SUPERADMIN_SECRET

// Session policy (SA-01). Two clocks:
//   - ABSOLUTE is the JWT lifetime; it never moves once issued.
//   - IDLE is enforced against the SuperAdminSession row, which slides
//     forward on activity. Middleware can't check it (edge, no DB), so
//     lib/session-guard.ts does on every Node-side request.
export const SESSION_ABSOLUTE_SECONDS = 8 * 60 * 60
export const SESSION_IDLE_SECONDS = 30 * 60
export const MAX_CONCURRENT_SESSIONS = 2

/** @deprecated kept for callers written against SA-00 */
export const SESSION_MAX_AGE = SESSION_ABSOLUTE_SECONDS

export const SESSION_COOKIE = "educore-sa.session-token"

export const authConfig = {
  session: { strategy: "jwt", maxAge: SESSION_ABSOLUTE_SECONDS },
  ...(RESOLVED_SECRET ? { secret: RESOLVED_SECRET } : {}),
  pages: {
    signIn: "/login",
    error: "/login",
  },
  trustHost: true,
  cookies: {
    // Deliberately distinct from the school app's cookie. Both apps run on
    // localhost in dev, where cookies are shared across ports — a collision
    // would let one session clobber the other.
    sessionToken: {
      name: SESSION_COOKIE,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [
    // Credentials is appended in lib/auth.ts (server-only: Prisma + bcrypt).
  ],
  callbacks: {
    async authorized({ auth }) {
      return !!auth?.user
    },
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          id?: string
          email?: string | null
          name?: string | null
          role?: SuperAdminRole
          sessionId?: string
        }
        if (u.id) token.userId = u.id
        if (u.email) token.email = u.email
        if (u.name) token.name = u.name
        if (u.role) token.role = u.role
        if (u.sessionId) token.sessionId = u.sessionId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.userId
        session.user.role = token.role
        session.user.sessionId = token.sessionId
      }
      return session
    },
  },
} satisfies NextAuthConfig
