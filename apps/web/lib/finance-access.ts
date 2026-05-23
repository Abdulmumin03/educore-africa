import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"

const READ_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "BURSAR"]
const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR"]
const APPROVE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

export async function resolveFinanceAccess(): Promise<
  | { ok: false; response: Response }
  | {
      ok: true
      session: { userId: string; role: UserRole; schoolId: string }
      canWrite: boolean
      canApprove: boolean
    }
> {
  const session = await auth()
  if (!session?.user)
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!session.user.schoolId)
    return { ok: false, response: NextResponse.json({ error: "No school context" }, { status: 400 }) }
  if (!READ_ROLES.includes(session.user.role))
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }

  return {
    ok: true,
    session: {
      userId: session.user.id,
      role: session.user.role,
      schoolId: session.user.schoolId,
    },
    canWrite: WRITE_ROLES.includes(session.user.role),
    canApprove: APPROVE_ROLES.includes(session.user.role),
  }
}
