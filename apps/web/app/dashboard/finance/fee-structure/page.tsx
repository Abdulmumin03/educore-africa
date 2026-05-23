import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { FeeStructureClient } from "@/components/dashboard/finance/fee-structure-client"

export const metadata = { title: "Fee structure · EduCore Africa" }

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR"]

export default async function FeeStructurePage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!ROLES.includes(session.user.role)) redirect("/dashboard/finance?forbidden=1")

  const [classes, years] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { level: "asc" },
    }),
    prisma.academicYear.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { startDate: "desc" },
      include: { terms: { orderBy: { startDate: "asc" } } },
    }),
  ])

  return (
    <FeeStructureClient
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
      years={years.map((y) => ({
        id: y.id,
        name: y.name,
        isCurrent: y.isCurrent,
        terms: y.terms.map((t) => ({ id: t.id, type: t.type, isCurrent: t.isCurrent })),
      }))}
    />
  )
}
