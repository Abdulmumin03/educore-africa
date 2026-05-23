import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveStaffAccess, canWriteStaff } from "@/lib/staff-access"
import { updateStaffSchema } from "@/lib/staff-schemas"

export const runtime = "nodejs"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const s = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    include: {
      user: {
        select: { firstName: true, lastName: true, email: true, phone: true, role: true, avatarUrl: true },
      },
      subjects: { include: { subject: { select: { id: true, name: true, code: true } } } },
      sectionAssignments: {
        include: {
          section: { include: { class: { select: { name: true } } } },
          academicYear: { select: { name: true, isCurrent: true } },
          subject: { select: { name: true, code: true } },
        },
      },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  })
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
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
    nin: s.nin,
    bvn: s.bvn,
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
    subjects: s.subjects.map((ss) => ({
      id: ss.subject.id,
      name: ss.subject.name,
      code: ss.subject.code,
    })),
    sectionAssignments: s.sectionAssignments.map((sa) => ({
      id: sa.id,
      className: sa.section.class.name,
      sectionName: sa.section.name,
      academicYearName: sa.academicYear.name,
      isCurrent: sa.academicYear.isCurrent,
      subjectName: sa.subject?.name ?? null,
      isFormTeacher: sa.isFormTeacher,
    })),
    documents: s.documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      label: d.label,
      url: d.url,
      createdAt: d.createdAt.toISOString(),
    })),
  })
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const target = await prisma.staff.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    select: { id: true, userId: true },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Writer must be a privileged role OR editing their own profile.
  const isSelf = target.userId === access.session.userId
  if (!isSelf && !canWriteStaff(access.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = updateStaffSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })
  const data = parsed.data

  await prisma.$transaction([
    prisma.staff.update({
      where: { id: target.id },
      data: {
        middleName: data.middleName ?? undefined,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        gender: data.gender ?? undefined,
        stateOfOrigin: data.stateOfOrigin ?? undefined,
        nin: data.nin ?? undefined,
        bvn: data.bvn ?? undefined,
        staffType: data.staffType,
        status: data.status,
        department: data.department ?? undefined,
        qualification: data.qualification ?? undefined,
        experienceYears: data.experienceYears,
        salaryGrade: data.gradeLevel ?? undefined,
        basicSalary:
          data.basicSalary === undefined
            ? undefined
            : data.basicSalary === null
              ? null
              : new Prisma.Decimal(data.basicSalary),
        allowances: data.allowances ?? undefined,
        deductions: data.deductions ?? undefined,
        bankName: data.bankName ?? undefined,
        accountNumber: data.accountNumber ?? undefined,
        accountName: data.accountName ?? undefined,
      },
    }),
    ...(data.phone !== undefined || data.photoUrl !== undefined
      ? [
          prisma.user.update({
            where: { id: target.userId },
            data: {
              phone: data.phone ?? undefined,
              avatarUrl: data.photoUrl ?? undefined,
            },
          }),
        ]
      : []),
  ])

  return NextResponse.json({ ok: true })
}
