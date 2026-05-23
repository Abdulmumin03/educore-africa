import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { StudentsList } from "@/components/dashboard/students/students-list"
import { redirect } from "next/navigation"

export const metadata = { title: "Students · EduCore Africa" }

export default async function StudentsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")

  const [classes, currentYear] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { level: "asc" },
      include: { sections: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
    }),
    prisma.academicYear.findFirst({
      where: { schoolId: session.user.schoolId, isCurrent: true },
      select: { id: true, name: true },
    }),
  ])

  return (
    <StudentsList
      canWrite={["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"].includes(
        session.user.role,
      )}
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
      }))}
      currentSession={currentYear?.name ?? null}
    />
  )
}
