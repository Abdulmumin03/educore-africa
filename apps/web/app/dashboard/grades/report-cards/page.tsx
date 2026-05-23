import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getDefaultCurriculum } from "@/lib/curriculum"
import { normaliseExamBody } from "@/lib/curriculum"
import { ReportCardsClient } from "@/components/dashboard/grades/report-cards-client"

export const metadata = { title: "Report cards · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

export default async function ReportCardsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  const [classes, terms, defaultCurriculum] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { level: "asc" },
      include: {
        sections: { where: { deletedAt: null }, orderBy: { name: "asc" } },
        curriculum: { select: { examBodyCode: true } },
      },
    }),
    prisma.term.findMany({
      where: { academicYear: { schoolId: session.user.schoolId }, deletedAt: null },
      orderBy: [{ academicYear: { startDate: "desc" } }, { startDate: "asc" }],
      include: { academicYear: { select: { name: true, isCurrent: true } } },
    }),
    getDefaultCurriculum(session.user.schoolId),
  ])

  const defaultExamBody = defaultCurriculum?.examBodyCode ?? "NONE"

  return (
    <ReportCardsClient
      canWrite={["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(session.user.role)}
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        examBodyCode: c.curriculum
          ? normaliseExamBody(c.curriculum.examBodyCode)
          : defaultExamBody,
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
