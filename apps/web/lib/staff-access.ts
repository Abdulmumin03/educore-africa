import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

const STAFF_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "LIBRARIAN",
  "HOSTEL_MASTER",
  "DRIVER",
]

const STAFF_WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]
const APPROVER_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

/**
 * Resolve who can see / write which staff records.
 *  - SUPER_ADMIN, SCHOOL_ADMIN, PRINCIPAL: all staff in the school (read+write)
 *  - Other staff roles (TEACHER, BURSAR, …): can READ all staff (directory) but
 *    can only WRITE their own profile (e.g. apply leave for self)
 *  - STUDENT / PARENT: no access
 */
export async function resolveStaffAccess(): Promise<
  | { ok: false; response: Response }
  | {
      ok: true
      session: { userId: string; role: UserRole; schoolId: string }
      ownStaffId: string | null
    }
> {
  const session = await auth()
  if (!session?.user)
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!session.user.schoolId) {
    return { ok: false, response: NextResponse.json({ error: "No school context" }, { status: 400 }) }
  }
  if (!STAFF_ROLES.includes(session.user.role)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  const ownStaff = await prisma.staff.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  return {
    ok: true,
    session: {
      userId: session.user.id,
      role: session.user.role,
      schoolId: session.user.schoolId,
    },
    ownStaffId: ownStaff?.id ?? null,
  }
}

export function canWriteStaff(role: UserRole) {
  return STAFF_WRITE_ROLES.includes(role)
}

export function canApproveLeave(role: UserRole) {
  return APPROVER_ROLES.includes(role)
}
