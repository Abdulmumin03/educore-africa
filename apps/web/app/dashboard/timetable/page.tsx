import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { TimetableClient } from "@/components/dashboard/timetable/timetable-client"

export const metadata = { title: "Timetable · EduCore Africa" }
export const dynamic = "force-dynamic"

const ADMIN_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] as const

export default async function TimetablePage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")

  const schoolId = session.user.schoolId
  const role = session.user.role
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(role)
  const isPrivileged = isAdmin || role === "TEACHER"

  const [year, classesRaw, teachersRaw, subjects] = await Promise.all([
    prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true, deletedAt: null },
      select: { id: true, name: true },
    }),
    isPrivileged
      ? prisma.class.findMany({
          where: { schoolId, deletedAt: null },
          orderBy: [{ level: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            sections: {
              where: { deletedAt: null },
              orderBy: { name: "asc" },
              select: { id: true, name: true },
            },
          },
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.staff.findMany({
          where: { schoolId, staffType: "TEACHING", status: "ACTIVE", deletedAt: null },
          orderBy: [{ user: { firstName: "asc" } }],
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.subject.findMany({
          where: { schoolId, isActive: true, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve([]),
  ])

  const teachers = teachersRaw.map((t) => ({
    id: t.id,
    name: `${t.user.firstName} ${t.user.lastName}`,
  }))

  // Determine the default view based on role.
  const defaultView: "me" | "class" | "teacher" =
    isAdmin ? "class" : "me"

  return (
    <div className="space-y-4 p-4 md:p-6">
      <TimetableClient
        currentUserRole={role}
        isAdmin={isAdmin}
        defaultView={defaultView}
        academicYear={year ? { id: year.id, name: year.name } : null}
        classes={classesRaw}
        teachers={teachers}
        subjects={subjects}
      />
    </div>
  )
}
