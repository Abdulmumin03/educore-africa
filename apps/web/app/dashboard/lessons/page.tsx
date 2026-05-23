import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { LessonsManager } from "@/components/dashboard/lessons/lessons-manager"

export const metadata = { title: "Lesson plans · EduCore Africa" }
export const dynamic = "force-dynamic"

const WRITE_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"] as const

export default async function LessonsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")
  if (!(WRITE_ROLES as readonly string[]).includes(session.user.role)) {
    redirect("/dashboard")
  }

  const schoolId = session.user.schoolId

  const [classes, subjects] = await Promise.all([
    prisma.class.findMany({
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
    }),
    prisma.subject.findMany({
      where: { schoolId, isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ])

  return (
    <div className="space-y-4 p-4 md:p-6">
      <LessonsManager
        classes={classes}
        subjects={subjects}
        aiConfigured={!!process.env.ANTHROPIC_API_KEY}
      />
    </div>
  )
}
