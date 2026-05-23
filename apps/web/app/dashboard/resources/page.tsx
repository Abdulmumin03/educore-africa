import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ResourceLibrary } from "@/components/dashboard/resources/resource-library"

export const metadata = { title: "Resources · EduCore Africa" }
export const dynamic = "force-dynamic"

const WRITE_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"] as const

export default async function ResourcesPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")

  const canUpload = (WRITE_ROLES as readonly string[]).includes(session.user.role)

  const subjects = await prisma.subject.findMany({
    where: { schoolId: session.user.schoolId, isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  })

  return (
    <div className="space-y-4 p-4 md:p-6">
      <ResourceLibrary canUpload={canUpload} subjects={subjects} />
    </div>
  )
}
