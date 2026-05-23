import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { TransportManager } from "@/components/dashboard/transport/transport-manager"

export const metadata = { title: "Transport · EduCore Africa" }
export const dynamic = "force-dynamic"

const ALLOWED_ROLES = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "DRIVER",
] as const

export default async function TransportPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")

  const role = session.user.role
  if (!(ALLOWED_ROLES as readonly string[]).includes(role)) {
    redirect("/dashboard")
  }
  const isAdmin = role !== "DRIVER"

  const drivers = await prisma.staff.findMany({
    where: {
      schoolId: session.user.schoolId,
      status: "ACTIVE",
      deletedAt: null,
      user: { role: { in: ["DRIVER"] } },
    },
    orderBy: { user: { firstName: "asc" } },
    select: {
      id: true,
      user: { select: { firstName: true, lastName: true } },
    },
  })

  return (
    <div className="space-y-4 p-4 md:p-6">
      <TransportManager
        isAdmin={isAdmin}
        drivers={drivers.map((s) => ({
          id: s.id,
          name: `${s.user.firstName} ${s.user.lastName}`,
        }))}
      />
    </div>
  )
}
