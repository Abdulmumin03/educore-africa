import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { AuditLogClient } from "@/components/dashboard/audit/audit-log-client"

export const metadata = { title: "Audit log · EduCore Africa" }
export const dynamic = "force-dynamic"

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] as const

export default async function AuditLogPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")
  if (!(VIEW_ROLES as readonly string[]).includes(session.user.role)) {
    redirect("/dashboard")
  }
  return (
    <div className="space-y-4 p-4 md:p-6">
      <AuditLogClient />
    </div>
  )
}
