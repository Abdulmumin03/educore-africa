import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { UsersManager } from "@/components/dashboard/settings/users-manager"

export const metadata = { title: "User accounts · EduCore Africa" }
export const dynamic = "force-dynamic"

const ADMIN_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] as const

export default async function UsersPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")
  if (!(ADMIN_ROLES as readonly string[]).includes(session.user.role)) {
    redirect("/dashboard")
  }
  return (
    <div className="p-4 md:p-6">
      <UsersManager />
    </div>
  )
}
