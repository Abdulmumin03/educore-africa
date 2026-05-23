import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { StudentRegistrationWizard } from "@/components/dashboard/students/registration-wizard"

export const metadata = { title: "Register student · EduCore Africa" }

const WRITE_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"] as const

export default async function NewStudentPage() {
  const session = await auth()
  if (
    !session?.user ||
    !session.user.schoolId ||
    !WRITE_ROLES.includes(session.user.role as typeof WRITE_ROLES[number])
  ) {
    redirect("/dashboard/students?forbidden=1")
  }

  const [classes, academicYears] = await Promise.all([
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
    <StudentRegistrationWizard
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
      }))}
      academicYears={academicYears}
    />
  )
}
