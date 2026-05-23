import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { MarkAttendance } from "@/components/dashboard/attendance/mark-attendance"

export const metadata = { title: "Mark attendance · EduCore Africa" }

const MARK_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

export default async function MarkAttendancePage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!MARK_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  return <MarkAttendance />
}
