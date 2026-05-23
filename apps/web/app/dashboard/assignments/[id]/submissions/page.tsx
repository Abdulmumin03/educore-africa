import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { SubmissionsReview } from "@/components/dashboard/assignments/submissions-review"

export const metadata = { title: "Submissions · EduCore Africa" }
export const dynamic = "force-dynamic"

const ADMIN_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] as const

export default async function SubmissionsPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")

  const a = await prisma.assignment.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: {
      id: true,
      title: true,
      teacher: { select: { userId: true } },
    },
  })
  if (!a) notFound()

  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.user.role)
  const isOwner = a.teacher.userId === session.user.id
  if (!isAdmin && !isOwner) notFound()

  return (
    <div className="space-y-4 p-4 md:p-6">
      <SubmissionsReview assignmentId={a.id} title={a.title} />
    </div>
  )
}
