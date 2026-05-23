import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ReportsClient } from "@/components/dashboard/attendance/reports-client"

export const metadata = { title: "Attendance reports · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "COUNSELOR"]

export default async function ReportsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  const classes = await prisma.class.findMany({
    where: { schoolId: session.user.schoolId, deletedAt: null },
    orderBy: { level: "asc" },
    include: {
      sections: { where: { deletedAt: null }, orderBy: { name: "asc" } },
    },
  })

  return (
    <ReportsClient
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
      }))}
    />
  )
}
