import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { DiscountsClient } from "@/components/dashboard/finance/discounts-client"

export const metadata = { title: "Fee discounts · EduCore Africa" }

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR", "PRINCIPAL"]

export default async function DiscountsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!ROLES.includes(session.user.role)) redirect("/dashboard/finance?forbidden=1")

  return (
    <DiscountsClient
      canApprove={["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(session.user.role)}
    />
  )
}
