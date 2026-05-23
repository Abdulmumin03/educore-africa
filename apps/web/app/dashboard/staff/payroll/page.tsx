import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { PayrollClient } from "@/components/dashboard/staff/payroll-client"

export const metadata = { title: "Payroll · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "BURSAR"]
const WRITE_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR"]

export default async function PayrollPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  return <PayrollClient canWrite={WRITE_ROLES.includes(session.user.role)} />
}
