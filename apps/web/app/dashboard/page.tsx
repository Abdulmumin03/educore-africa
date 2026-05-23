import { auth } from "@/lib/auth"
import { ParentDashboard } from "@/components/dashboard/parent/parent-dashboard"
import { ExecutiveDashboard } from "@/components/dashboard/exec/executive-dashboard"

export const metadata = { title: "Dashboard · EduCore Africa" }
export const dynamic = "force-dynamic"

export default async function DashboardHome() {
  const session = await auth()
  const schoolId = session?.user.schoolId

  // Parents get a child-scoped view — don't leak school-wide counts.
  if (session?.user.role === "PARENT" && schoolId) {
    return (
      <ParentDashboard
        parentUserId={session.user.id}
        schoolId={schoolId}
        firstName={session.user.name?.split(" ")[0] ?? "there"}
      />
    )
  }

  const firstName = session?.user.name?.split(" ")[0] ?? "there"
  return (
    <div className="p-4 md:p-6">
      <ExecutiveDashboard firstName={firstName} userRole={session?.user.role ?? null} />
    </div>
  )
}
