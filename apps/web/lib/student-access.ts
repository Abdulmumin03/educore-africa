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
]

/**
 * Resolve who can see which students.
 *  - Staff roles: every active student in the school
 *  - PARENT: only students linked via student_parents
 *  - STUDENT: only themselves
 *
 * Returns either an `ids` whitelist (for non-staff) or `null` meaning "all in school".
 */
export async function resolveStudentAccess(): Promise<
  | { ok: false; response: Response }
  | {
      ok: true
      session: { userId: string; role: UserRole; schoolId: string }
      visibility: { ids: string[] | null } // null = staff scope (all in school)
    }
> {
  const session = await auth()
  if (!session?.user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!session.user.schoolId) {
    return { ok: false, response: NextResponse.json({ error: "No school context" }, { status: 400 }) }
  }

  const base = {
    userId: session.user.id,
    role: session.user.role,
    schoolId: session.user.schoolId,
  }

  if (STAFF_ROLES.includes(session.user.role)) {
    return { ok: true, session: base, visibility: { ids: null } }
  }

  if (session.user.role === "PARENT") {
    const parent = await prisma.parent.findUnique({
      where: { userId: session.user.id },
      select: { students: { select: { studentId: true } } },
    })
    return {
      ok: true,
      session: base,
      visibility: { ids: parent?.students.map((s) => s.studentId) ?? [] },
    }
  }

  if (session.user.role === "STUDENT") {
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    return { ok: true, session: base, visibility: { ids: student ? [student.id] : [] } }
  }

  return { ok: true, session: base, visibility: { ids: [] } }
}

const STAFF_WRITE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
]

export function canWriteStudents(role: UserRole) {
  return STAFF_WRITE_ROLES.includes(role)
}
