import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ROLES } from "@/lib/permissions"
import { PermissionMatrix } from "@/components/dashboard/settings/permission-matrix"

export const metadata = { title: "Roles & permissions · EduCore Africa" }
export const dynamic = "force-dynamic"

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] as const

export default async function RolesPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")
  if (!(VIEW_ROLES as readonly string[]).includes(session.user.role)) {
    redirect("/dashboard")
  }

  const counts = await prisma.user.groupBy({
    by: ["role"],
    where: { schoolId: session.user.schoolId, deletedAt: null },
    _count: { _all: true },
  })
  const countByRole = new Map(counts.map((c) => [c.role, c._count._all]))
  const rolesWithCounts = ROLES.map((r) => ({
    role: r,
    count: countByRole.get(r) ?? 0,
  }))

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PermissionMatrix rolesWithCounts={rolesWithCounts} />
    </div>
  )
}
