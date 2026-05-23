import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { AnalyticsClient } from "@/components/dashboard/analytics/analytics-client"

export const metadata = { title: "Analytics · EduCore Africa" }
export const dynamic = "force-dynamic"

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] as const

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")
  if (!(VIEW_ROLES as readonly string[]).includes(session.user.role)) {
    redirect("/dashboard")
  }
  return (
    <div className="p-4 md:p-6">
      <AnalyticsClient />
    </div>
  )
}
