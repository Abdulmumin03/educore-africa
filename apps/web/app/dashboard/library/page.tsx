import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { LibraryManager } from "@/components/dashboard/library/library-manager"
import { getFineRate } from "@/lib/library-helpers"

export const metadata = { title: "Library · EduCore Africa" }
export const dynamic = "force-dynamic"

const WRITE_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "LIBRARIAN"] as const

export default async function LibraryPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")

  const role = session.user.role
  const canWrite = (WRITE_ROLES as readonly string[]).includes(role)

  const [subjects, finePerDay] = await Promise.all([
    canWrite
      ? prisma.subject.findMany({
          where: { schoolId: session.user.schoolId, isActive: true, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, code: true },
        })
      : Promise.resolve([]),
    getFineRate(session.user.schoolId),
  ])

  return (
    <div className="space-y-4 p-4 md:p-6">
      <LibraryManager
        canWrite={canWrite}
        canSeeFines={canWrite || role === "BURSAR"}
        subjects={subjects}
        finePerDay={finePerDay}
      />
    </div>
  )
}
