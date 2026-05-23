import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { StaffList } from "@/components/dashboard/staff/staff-list"

export const metadata = { title: "Staff · EduCore Africa" }

export default async function StaffPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")

  return (
    <StaffList
      canWrite={["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(session.user.role)}
    />
  )
}
