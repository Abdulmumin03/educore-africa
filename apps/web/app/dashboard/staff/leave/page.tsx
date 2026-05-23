import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { LeaveManagement } from "@/components/dashboard/staff/leave-management"

export const metadata = { title: "Leave · EduCore Africa" }

export default async function StaffLeavePage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")

  const myStaff = await prisma.staff.findUnique({
    where: { userId: session.user.id },
    select: { id: true, staffNumber: true, user: { select: { firstName: true, lastName: true } } },
  })

  const isApprover = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(session.user.role)

  // For substitute picker on the admin queue.
  const allStaff = isApprover
    ? await prisma.staff.findMany({
        where: {
          schoolId: session.user.schoolId,
          deletedAt: null,
          status: { in: ["ACTIVE"] },
          ...(myStaff ? { id: { not: myStaff.id } } : {}),
        },
        orderBy: { user: { lastName: "asc" } },
        select: {
          id: true,
          staffNumber: true,
          department: true,
          user: { select: { firstName: true, lastName: true } },
        },
      })
    : []

  return (
    <LeaveManagement
      isApprover={isApprover}
      myStaffId={myStaff?.id ?? null}
      myStaffName={
        myStaff ? `${myStaff.user.firstName} ${myStaff.user.lastName}` : null
      }
      staff={allStaff.map((s) => ({
        id: s.id,
        staffNumber: s.staffNumber,
        firstName: s.user.firstName,
        lastName: s.user.lastName,
        department: s.department,
      }))}
    />
  )
}
