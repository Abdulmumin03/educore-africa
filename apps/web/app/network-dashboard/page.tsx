import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { NetworkDashboard } from "@/components/dashboard/network/network-dashboard"

export const metadata = { title: "Network · EduCore Africa" }
export const dynamic = "force-dynamic"

export default async function NetworkDashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "SUPER_ADMIN") redirect("/dashboard")

  return (
    <div className="p-4 md:p-6">
      <NetworkDashboard />
    </div>
  )
}
