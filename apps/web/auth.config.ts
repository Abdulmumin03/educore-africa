import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"

// Edge-safe config. NO Prisma, NO bcrypt, NO node-only deps in here —
// the middleware imports this to run on the edge runtime.

// Auth.js v5 reads AUTH_SECRET by default; accept the legacy NEXTAUTH_SECRET
// name too so both runtimes (Node + edge middleware) derive the SAME secret.
// Only pass it when actually defined — passing `secret: undefined` explicitly
// trips up NextAuth's config validation in v5 beta and returns a 500.
const RESOLVED_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET

export const authConfig = {
  session: { strategy: "jwt" },
  ...(RESOLVED_SECRET ? { secret: RESOLVED_SECRET } : {}),
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Allow account linking by email — useful when a user signs up
      // via Credentials and later signs in with Google using the same address.
      allowDangerousEmailAccountLinking: true,
    }),
    // Credentials is appended in lib/auth.ts (server-only).
  ],
  callbacks: {
    async authorized({ auth }) {
      // We do per-route gating in middleware.ts. Returning true here means
      // NextAuth's own authorization check passes; middleware handles redirects.
      return !!auth?.user
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id as string
        // role and schoolId are set by the Credentials authorize() callback
        // in lib/auth.ts; for OAuth users they get filled in by the
        // signIn callback in lib/auth.ts as well.
        const u = user as { role?: string; schoolId?: string | null }
        if (u.role) token.role = u.role as typeof token.role
        if ("schoolId" in u) token.schoolId = u.schoolId ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.userId
        session.user.role = token.role
        session.user.schoolId = token.schoolId ?? null
        session.user.schoolSlug = token.schoolSlug ?? null
        session.user.schoolName = token.schoolName ?? null
      }
      return session
    },
  },
} satisfies NextAuthConfig
