import { redirect } from "next/navigation"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { CommunicationAnalyticsClient } from "@/components/dashboard/communications/analytics-client"

export const metadata = { title: "Communication analytics · EduCore Africa" }

const VIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

export default async function CommunicationAnalyticsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  return <CommunicationAnalyticsClient />
}
