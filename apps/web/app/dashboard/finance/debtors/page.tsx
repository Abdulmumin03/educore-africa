import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { DebtorsClient } from "@/components/dashboard/finance/debtors-client"

export const metadata = { title: "Debtors · EduCore Africa" }

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR", "PRINCIPAL"]

export default async function DebtorsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!ROLES.includes(session.user.role)) redirect("/dashboard/finance?forbidden=1")

  const [classes, terms] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { level: "asc" },
    }),
    prisma.term.findMany({
      where: { academicYear: { schoolId: session.user.schoolId }, deletedAt: null },
      orderBy: [{ academicYear: { startDate: "desc" } }, { startDate: "asc" }],
      include: { academicYear: { select: { name: true, isCurrent: true } } },
    }),
  ])

  return (
    <DebtorsClient
      canWrite={["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR"].includes(session.user.role)}
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
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
