import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { AskClient } from "@/components/dashboard/ai/ask-client"

export const metadata = { title: "Ask EduCore · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "COUNSELOR", "BURSAR"]

export default async function AskPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard/ai?forbidden=1")

  return <AskClient />
}
