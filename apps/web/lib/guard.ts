import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"

export type GuardedSession = {
  user: {
    id: string
    email: string
    role: UserRole
    schoolId: string
  }
}

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN"]

export async function requireSchoolAdmin(): Promise<
  | { ok: true; session: GuardedSession }
  | { ok: false; response: Response }
> {
  const session = await auth()
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  if (!ADMIN_ROLES.includes(session.user.role)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  if (!session.user.schoolId && session.user.role !== "SUPER_ADMIN") {
    return { ok: false, response: NextResponse.json({ error: "No school context" }, { status: 400 }) }
  }
  return {
    ok: true,
    session: {
      user: {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        schoolId: session.user.schoolId ?? "",
      },
    },
  }
}
