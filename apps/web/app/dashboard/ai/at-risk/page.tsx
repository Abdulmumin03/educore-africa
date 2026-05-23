import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { AtRiskClient } from "@/components/dashboard/ai/at-risk-client"

export const metadata = { title: "At-risk students · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "COUNSELOR"]

export default async function AtRiskPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard/ai?forbidden=1")

  return (
    <AtRiskClient
      canRun={["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "COUNSELOR"].includes(session.user.role)}
    />
  )
}
