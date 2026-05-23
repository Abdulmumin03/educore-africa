import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/auth/login?callbackUrl=/dashboard")

  const school = session.user.schoolId
    ? await prisma.school.findUnique({
        where: { id: session.user.schoolId },
        select: { name: true, logoUrl: true },
      })
    : null

  return (
    <DashboardShell
      user={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        role: session.user.role,
      }}
      school={school}
    >
      {children}
    </DashboardShell>
  )
}
