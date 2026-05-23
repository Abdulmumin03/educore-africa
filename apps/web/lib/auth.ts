import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { authConfig } from "@/auth.config"
import { prisma } from "@/lib/db"

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credsSchema.safeParse(raw)
        if (!parsed.success) return null
        const { email, password } = parsed.data

        const user = await prisma.user.findUnique({
          where: { email },
          include: { school: { select: { id: true, slug: true, name: true } } },
        })
        if (!user || !user.passwordHash || !user.isActive || user.deletedAt) return null

        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return null

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          image: user.avatarUrl ?? undefined,
          role: user.role,
          schoolId: user.schoolId,
          firstName: user.firstName,
          lastName: user.lastName,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      // Google OAuth users: link to an existing User by email, otherwise reject —
      // schools onboard via /onboard, not via Google. We do NOT auto-create
      // users from Google sign-in.
      if (account?.provider === "google" && profile?.email) {
        const existing = await prisma.user.findUnique({
          where: { email: profile.email },
        })
        if (!existing || !existing.isActive || existing.deletedAt) return false
        // Hydrate the user object NextAuth passes downstream so jwt() picks
        // up role/schoolId.
        ;(user as { id?: string; role?: string; schoolId?: string | null }).id = existing.id
        ;(user as { role?: string }).role = existing.role
        ;(user as { schoolId?: string | null }).schoolId = existing.schoolId
        return true
      }
      return true
    },
    async jwt({ token, user, trigger }) {
      // Run the edge-safe base callback first.
      const base = await authConfig.callbacks.jwt({ token, user, trigger } as never)
      const t = base as typeof token

      // Hydrate school metadata once per token lifecycle (or on update).
      if ((trigger === "signIn" || trigger === "update" || !t.schoolName) && t.schoolId) {
        const school = await prisma.school.findUnique({
          where: { id: t.schoolId },
          select: { slug: true, name: true },
        })
        if (school) {
          t.schoolSlug = school.slug
          t.schoolName = school.name
        }
      }
      return t
    },
  },
})
