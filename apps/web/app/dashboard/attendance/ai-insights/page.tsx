import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { AiInsightsClient } from "@/components/dashboard/attendance/ai-insights-client"

export const metadata = { title: "Attendance AI insights · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "COUNSELOR"]

export default async function AiInsightsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  return <AiInsightsClient />
}
