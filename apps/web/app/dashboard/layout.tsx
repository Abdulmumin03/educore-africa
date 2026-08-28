import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { ImpersonationBanner } from "@/components/impersonation/impersonation-banner"
import { PlatformBanner } from "@/components/shared/platform-banner"
import { activeNoticesForSchool } from "@/lib/platform-notices"
import { SyncManager } from "@/components/pwa/sync-manager"
import { currentImpersonation } from "@/lib/impersonation"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  // A support session from the Super Admin Console is a second, weaker way in:
  // no NextAuth session exists, the grant itself is the credential, and
  // middleware blocks every non-GET request for its duration.
  const impersonation = session?.user ? null : await currentImpersonation()

  if (!session?.user && !impersonation) redirect("/auth/login?callbackUrl=/dashboard")

  const schoolId = session?.user?.schoolId ?? impersonation?.schoolId ?? null
  const school = schoolId
    ? await prisma.school.findUnique({
        where: { id: schoolId },
        select: { name: true, logoUrl: true },
      })
    : null

  const user = session?.user
    ? {
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        role: session.user.role,
      }
    : {
        name: "EduCore Support",
        email: "support@educoreafrica.com",
        image: null,
        role: "SUPER_ADMIN" as const,
      }

  // Platform notices published from the EduCore console. Read here rather than
  // per page so a maintenance window is visible wherever the user happens to be.
  const notices = schoolId ? await activeNoticesForSchool(schoolId) : []

  return (
    <>
      {impersonation && (
        <ImpersonationBanner
          schoolName={impersonation.school.name}
          expiresAt={impersonation.expiresAt}
        />
      )}
      <div className={impersonation ? "pt-8" : undefined}>
        <DashboardShell user={user} school={school}>
          {notices.length > 0 && (
            <div className="mb-4">
              <PlatformBanner notices={notices} />
            </div>
          )}
          {children}
          {!impersonation && <SyncManager />}
        </DashboardShell>
      </div>
    </>
  )
}
