import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { AiDashboardClient } from "@/components/dashboard/ai/dashboard-client"

export const metadata = { title: "AI Insights · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "COUNSELOR"]
const INSIGHTS_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

export default async function AiDashboardPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  return <AiDashboardClient canSeeInsights={INSIGHTS_ROLES.includes(session.user.role)} />
}
