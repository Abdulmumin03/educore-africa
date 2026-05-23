import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { StaffProfile } from "@/components/dashboard/staff/profile/staff-profile"

export const metadata = { title: "Staff profile · EduCore Africa" }

export default async function StaffProfilePage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")

  const s = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    include: {
      user: { select: { firstName: true, lastName: true, email: true, phone: true, role: true, avatarUrl: true } },
      subjects: { include: { subject: { select: { id: true, name: true, code: true } } } },
    },
  })
  if (!s) notFound()

  const canWrite =
    ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(session.user.role) ||
    s.userId === session.user.id

  return (
    <StaffProfile
      canWrite={canWrite}
      isSelf={s.userId === session.user.id}
      currentUserRole={session.user.role}
      staff={{
        id: s.id,
        staffNumber: s.staffNumber,
        staffType: s.staffType,
        status: s.status,
        role: s.user.role,
        firstName: s.user.firstName,
        middleName: s.middleName,
        lastName: s.user.lastName,
        email: s.user.email,
        phone: s.user.phone,
        avatarUrl: s.user.avatarUrl,
        gender: s.gender,
        dateOfBirth: s.dateOfBirth ? s.dateOfBirth.toISOString() : null,
        stateOfOrigin: s.stateOfOrigin,
        hireDate: s.hireDate.toISOString(),
        department: s.department,
        qualification: s.qualification,
        experienceYears: s.experienceYears,
        salaryGrade: s.salaryGrade,
        basicSalary: s.basicSalary ? Number(s.basicSalary) : null,
        allowances: (s.allowances ?? []) as { name: string; amount: number }[],
        deductions: (s.deductions ?? []) as { name: string; amount: number }[],
        bankName: s.bankName,
        accountNumber: s.accountNumber,
        accountName: s.accountName,
        subjects: s.subjects.map((ss) => ({ id: ss.subject.id, name: ss.subject.name, code: ss.subject.code })),
      }}
    />
  )
}
