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
const WRITE_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]
const PRIVILEGED: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

export async function resolveGradeAccess(): Promise<
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
    isPrivileged: PRIVILEGED.includes(session.user.role),
  }
}

/**
 * A teacher may grade a (subject, section) pair if they're assigned to teach
 * that subject in that section (via StaffSubject + StaffSectionAssignment, OR
 * Timetable). Privileged roles can grade anywhere.
 */
export async function teacherCanGrade(opts: {
  schoolId: string
  staffId: string | null
  subjectId: string
  sectionId: string
  isPrivileged: boolean
}): Promise<boolean> {
  if (opts.isPrivileged) return true
  if (!opts.staffId) return false

  const [subj, timetable] = await Promise.all([
    prisma.staffSubject.findFirst({
      where: { staffId: opts.staffId, subjectId: opts.subjectId },
      select: { staffId: true },
    }),
    prisma.timetable.findFirst({
      where: {
        teacherId: opts.staffId,
        sectionId: opts.sectionId,
        subjectId: opts.subjectId,
        deletedAt: null,
      },
      select: { id: true },
    }),
  ])
  // Either an explicit subject assignment OR an actual timetable row counts.
  return !!subj || !!timetable
}
