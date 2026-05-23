import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { AssignmentDetail } from "@/components/dashboard/assignments/assignment-detail"

export const metadata = { title: "Assignment · EduCore Africa" }
export const dynamic = "force-dynamic"

export default async function AssignmentPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (!session.user.schoolId) redirect("/onboarding")

  const a = await prisma.assignment.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      teacher: {
        select: {
          id: true,
          userId: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })
  if (!a) notFound()

  // Students must be enrolled in one of the target sections.
  let isStudent = false
  if (session.user.role === "STUDENT") {
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: {
        enrollments: {
          where: { isActive: true, deletedAt: null },
          select: { sectionId: true },
          take: 1,
        },
      },
    })
    const mine = student?.enrollments[0]?.sectionId
    if (!mine || !a.sectionIds.includes(mine)) notFound()
    isStudent = true
  }

  const sections = a.sectionIds.length
    ? await prisma.section.findMany({
        where: { id: { in: a.sectionIds }, schoolId: session.user.schoolId, deletedAt: null },
        select: {
          id: true,
          name: true,
          class: { select: { name: true } },
        },
      })
    : []

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AssignmentDetail
        isStudent={isStudent}
        assignment={{
          id: a.id,
          title: a.title,
          description: a.description,
          instructionsMd: a.instructionsMd,
          dueDate: a.dueDate.toISOString(),
          maxScore: a.maxScore,
          allowLate: a.allowLate,
          attachments: (a.attachments ?? null) as
            | { url: string; name: string; size: number; type: string }[]
            | null,
          subject: a.subject,
          teacher: {
            firstName: a.teacher.user.firstName,
            lastName: a.teacher.user.lastName,
          },
          sections: sections.map((s) => ({
            id: s.id,
            name: s.name,
            className: s.class.name,
          })),
        }}
      />
    </div>
  )
}
