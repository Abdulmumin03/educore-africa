import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { VisitorsManager } from "@/components/dashboard/visitors/visitors-manager"

export const metadata = { title: "Visitors · EduCore Africa" }
export const dynamic = "force-dynamic"

const STAFF_ROLES = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "LIBRARIAN",
  "HOSTEL_MASTER",
] as const

const EXPORT_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] as const

export default async function VisitorsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")

  const role = session.user.role
  if (!(STAFF_ROLES as readonly string[]).includes(role)) {
    redirect("/dashboard")
  }

  // Hosts = anyone on staff who can receive visitors.
  const hosts = await prisma.user.findMany({
    where: {
      schoolId: session.user.schoolId,
      isActive: true,
      deletedAt: null,
      role: {
        in: [
          "SUPER_ADMIN",
          "SCHOOL_ADMIN",
          "PRINCIPAL",
          "TEACHER",
          "BURSAR",
          "COUNSELOR",
          "LIBRARIAN",
          "HOSTEL_MASTER",
        ],
      },
    },
    orderBy: [{ firstName: "asc" }],
    take: 500,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  })

  return (
    <div className="space-y-4 p-4 md:p-6">
      <VisitorsManager
        canExport={(EXPORT_ROLES as readonly string[]).includes(role)}
        hosts={hosts.map((u) => ({
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          role: u.role,
        }))}
      />
    </div>
  )
}
