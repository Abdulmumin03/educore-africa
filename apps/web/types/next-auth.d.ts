import type { UserRole } from "@prisma/client"
import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: UserRole
      schoolId: string | null
      schoolSlug?: string | null
      schoolName?: string | null
    }
  }

  interface User {
    id: string
    email: string
    role: UserRole
    schoolId: string | null
    firstName?: string
    lastName?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string
    role: UserRole
    schoolId: string | null
    schoolSlug?: string | null
    schoolName?: string | null
  }
}
