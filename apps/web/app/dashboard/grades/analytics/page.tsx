import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { GradeAnalytics } from "@/components/dashboard/grades/grade-analytics"

export const metadata = { title: "Grade analytics · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "COUNSELOR"]

export default async function GradeAnalyticsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  const [classes, terms] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { level: "asc" },
      include: { sections: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
    }),
    prisma.term.findMany({
      where: { academicYear: { schoolId: session.user.schoolId }, deletedAt: null },
      orderBy: [{ academicYear: { startDate: "desc" } }, { startDate: "asc" }],
      include: { academicYear: { select: { name: true, isCurrent: true } } },
    }),
  ])

  return (
    <GradeAnalytics
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
      }))}
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
