import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { InvoicesClient } from "@/components/dashboard/finance/invoices-client"

export const metadata = { title: "Invoices · EduCore Africa" }

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR", "PRINCIPAL"]
const WRITE_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR"]

export default async function InvoicesPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!ROLES.includes(session.user.role)) redirect("/dashboard/finance?forbidden=1")

  const [classes, terms] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { level: "asc" },
      include: { sections: { where: { deletedAt: null } } },
    }),
    prisma.term.findMany({
      where: { academicYear: { schoolId: session.user.schoolId }, deletedAt: null },
      orderBy: [{ academicYear: { startDate: "desc" } }, { startDate: "asc" }],
      include: { academicYear: { select: { name: true, isCurrent: true } } },
    }),
  ])

  return (
    <InvoicesClient
      canWrite={WRITE_ROLES.includes(session.user.role)}
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
