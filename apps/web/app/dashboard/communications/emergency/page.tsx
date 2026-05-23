import { redirect } from "next/navigation"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { EmergencyAlertClient } from "@/components/dashboard/communications/emergency-alert-client"

export const metadata = { title: "Emergency alerts · EduCore Africa" }

const SEND_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

export default async function EmergencyPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!SEND_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  return <EmergencyAlertClient />
}
