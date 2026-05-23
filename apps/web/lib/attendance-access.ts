import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

const READ_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "COUNSELOR",
]

const WRITE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
]

/**
 * Resolve who can read / mark attendance. Returns the session + the teacher's
 * staffId (or null) so callers can scope writes to their assigned sections.
 */
export async function resolveAttendanceAccess(): Promise<
  | { ok: false; response: Response }
  | {
      ok: true
      session: { userId: string; role: UserRole; schoolId: string }
      teacherStaffId: string | null
      canWrite: boolean
      isPrivileged: boolean
    }
> {
  const session = await auth()
  if (!session?.user)
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!session.user.schoolId)
    return { ok: false, response: NextResponse.json({ error: "No school context" }, { status: 400 }) }
  if (!READ_ROLES.includes(session.user.role))
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }

  const staff = await prisma.staff.findUnique({
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
    teacherStaffId: staff?.id ?? null,
    canWrite: WRITE_ROLES.includes(session.user.role),
    isPrivileged: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(session.user.role),
  }
}

/**
 * Confirm the staff member is authorised to mark attendance for this section:
 *   - admin/principal: any section in the school
 *   - teacher: must be the section's form teacher, OR have a section assignment,
 *     OR have a timetable row teaching this section
 */
export async function staffCanMarkSection(opts: {
  schoolId: string
  staffId: string | null
  sectionId: string
  isPrivileged: boolean
}): Promise<boolean> {
  if (opts.isPrivileged) return true
  if (!opts.staffId) return false

  const [formSection, assignment, timetable] = await Promise.all([
    prisma.section.findFirst({
      where: { id: opts.sectionId, schoolId: opts.schoolId, teacherId: opts.staffId },
      select: { id: true },
    }),
    prisma.staffSectionAssignment.findFirst({
      where: { staffId: opts.staffId, sectionId: opts.sectionId },
      select: { id: true },
    }),
    prisma.timetable.findFirst({
      where: { teacherId: opts.staffId, sectionId: opts.sectionId, deletedAt: null },
      select: { id: true },
    }),
  ])

  return !!(formSection || assignment || timetable)
}
