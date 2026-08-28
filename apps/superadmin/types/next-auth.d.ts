import type { SuperAdminRole } from "@prisma/client"
import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: SuperAdminRole
      /** SuperAdminSession.token — lets us revoke a live session server-side. */
      sessionId: string
    }
  }

  interface User {
    id?: string
    email?: string | null
    name?: string | null
    role?: SuperAdminRole
    sessionId?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string
    email: string
    name: string
    role: SuperAdminRole
    sessionId: string
  }
}
