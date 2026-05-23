import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { GradeImportClient } from "@/components/dashboard/grades/grade-import"

export const metadata = { title: "Grade import · EduCore Africa" }

const WRITE_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

export default async function GradeImportPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!WRITE_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  const [classes, subjects, terms] = await Promise.all([
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
    prisma.term.findMany({
      where: { academicYear: { schoolId: session.user.schoolId }, deletedAt: null },
      orderBy: [{ academicYear: { startDate: "desc" } }, { startDate: "asc" }],
      include: { academicYear: { select: { name: true, isCurrent: true } } },
    }),
  ])

  return (
    <GradeImportClient
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
      }))}
      subjects={subjects}
      terms={terms.map((t) => ({
        id: t.id,
        type: t.type,
        sessionName: t.academicYear.name,
        isCurrent: t.isCurrent,
        sessionIsCurrent: t.academicYear.isCurrent,
      }))}
    />
  )
}
