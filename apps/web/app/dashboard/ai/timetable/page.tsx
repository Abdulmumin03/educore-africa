import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { TimetableClient } from "@/components/dashboard/ai/timetable-client"

export const metadata = { title: "AI timetable · EduCore Africa" }

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

export default async function TimetablePage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!ROLES.includes(session.user.role)) redirect("/dashboard/ai?forbidden=1")

  const [classes, subjects, teachers, years] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { level: "asc" },
      include: { sections: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
    }),
    prisma.subject.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.staff.findMany({
      where: {
        schoolId: session.user.schoolId,
        deletedAt: null,
        status: "ACTIVE",
        staffType: { in: ["TEACHING"] },
      },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { user: { lastName: "asc" } },
    }),
    prisma.academicYear.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { startDate: "desc" },
    }),
  ])

  return (
    <TimetableClient
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
      }))}
      subjects={subjects}
      teachers={teachers.map((t) => ({
        id: t.id,
        name: `${t.user.firstName} ${t.user.lastName}`,
      }))}
      years={years.map((y) => ({ id: y.id, name: y.name, isCurrent: y.isCurrent }))}
    />
  )
}
