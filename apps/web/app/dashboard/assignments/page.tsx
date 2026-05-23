import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { AssignmentsManager } from "@/components/dashboard/assignments/assignments-manager"

export const metadata = { title: "Assignments · EduCore Africa" }
export const dynamic = "force-dynamic"

const ADMIN_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] as const
const WRITE_ROLES = [...ADMIN_ROLES, "TEACHER"] as const

export default async function AssignmentsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")

  const schoolId = session.user.schoolId
  const role = session.user.role
  const canWrite = (WRITE_ROLES as readonly string[]).includes(role)

  const [classes, subjects] = await Promise.all([
    canWrite
      ? prisma.class.findMany({
          where: { schoolId, deletedAt: null },
          orderBy: [{ level: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            sections: {
              where: { deletedAt: null },
              orderBy: { name: "asc" },
              select: { id: true, name: true },
            },
          },
        })
      : Promise.resolve([]),
    canWrite
      ? prisma.subject.findMany({
          where: { schoolId, isActive: true, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve([]),
  ])

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AssignmentsManager
        currentUserId={session.user.id}
        currentUserRole={role}
        canWrite={canWrite}
        classes={classes}
        subjects={subjects}
      />
    </div>
  )
}
