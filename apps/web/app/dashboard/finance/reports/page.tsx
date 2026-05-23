import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { FinanceReportsClient } from "@/components/dashboard/finance/reports-client"

export const metadata = { title: "Finance reports · EduCore Africa" }

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR", "PRINCIPAL"]

export default async function FinanceReportsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!ROLES.includes(session.user.role)) redirect("/dashboard/finance?forbidden=1")

  const terms = await prisma.term.findMany({
    where: { academicYear: { schoolId: session.user.schoolId }, deletedAt: null },
    orderBy: [{ academicYear: { startDate: "desc" } }, { startDate: "asc" }],
    include: { academicYear: { select: { name: true, isCurrent: true } } },
  })

  return (
    <FinanceReportsClient
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
