import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { StaffRegistrationWizard } from "@/components/dashboard/staff/registration-wizard"

export const metadata = { title: "Register staff · EduCore Africa" }

export default async function NewStaffPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(session.user.role)) {
    redirect("/dashboard/staff?forbidden=1")
  }

  const [subjects, classes, academicYears] = await Promise.all([
    prisma.subject.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, category: true },
    }),
    prisma.class.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { level: "asc" },
      include: { sections: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
    }),
    prisma.academicYear.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, isCurrent: true },
    }),
  ])

  return (
    <StaffRegistrationWizard
      subjects={subjects}
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
      }))}
      academicYears={academicYears}
    />
  )
}
