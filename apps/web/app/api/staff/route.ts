import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { Prisma } from "@prisma/client"
import type { UserRole } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveStaffAccess, canWriteStaff } from "@/lib/staff-access"
import { registerStaffSchema } from "@/lib/staff-schemas"
import { generateStaffNumber } from "@/lib/staff-number"

export const runtime = "nodejs"

// ─── LIST ──────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1))
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)))
  const search = (url.searchParams.get("search") ?? "").trim()
  const role = url.searchParams.get("role") as UserRole | null
  const department = url.searchParams.get("department")
  const staffType = url.searchParams.get("staffType") as
    | "TEACHING"
    | "NON_TEACHING"
    | "ADMIN"
    | "CONTRACT"
    | "NYSC"
    | null
  const status = url.searchParams.get("status") as
    | "ACTIVE"
    | "ON_LEAVE"
    | "SUSPENDED"
    | "RESIGNED"
    | "TERMINATED"
    | "RETIRED"
    | null

  const where: Prisma.StaffWhereInput = {
    schoolId: access.session.schoolId,
    deletedAt: null,
    ...(department ? { department } : {}),
    ...(staffType ? { staffType } : {}),
    ...(status ? { status } : {}),
    ...(role ? { user: { role } } : {}),
  }
  if (search) {
    where.OR = [
      { staffNumber: { contains: search, mode: "insensitive" } },
      { user: { firstName: { contains: search, mode: "insensitive" } } },
      { user: { lastName: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { department: { contains: search, mode: "insensitive" } },
    ]
  }

  const [total, rows] = await Promise.all([
    prisma.staff.count({ where }),
    prisma.staff.findMany({
      where,
      orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { firstName: true, lastName: true, email: true, phone: true, role: true, avatarUrl: true } },
        subjects: { include: { subject: { select: { name: true, code: true } } } },
      },
    }),
  ])

  const visibleWhere = { schoolId: access.session.schoolId, deletedAt: null }
  const [statTotal, statTeaching, statAdmin, statOnLeave] = await Promise.all([
    prisma.staff.count({ where: visibleWhere }),
    prisma.staff.count({ where: { ...visibleWhere, staffType: "TEACHING" } }),
    prisma.staff.count({ where: { ...visibleWhere, staffType: "ADMIN" } }),
    prisma.staff.count({ where: { ...visibleWhere, status: "ON_LEAVE" } }),
  ])

  return NextResponse.json({
    items: rows.map((s) => ({
      id: s.id,
      staffNumber: s.staffNumber,
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      email: s.user.email,
      phone: s.user.phone,
      avatarUrl: s.user.avatarUrl,
      role: s.user.role,
      staffType: s.staffType,
      status: s.status,
      department: s.department,
      subjects: s.subjects.map((ss) => ({ name: ss.subject.name, code: ss.subject.code })),
    })),
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    stats: { total: statTotal, teaching: statTeaching, admin: statAdmin, onLeave: statOnLeave },
  })
}

// ─── CREATE ────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response
  if (!canWriteStaff(access.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = registerStaffSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { personal, employment, assignments, salary, documents } = parsed.data

  const school = await prisma.school.findUnique({
    where: { id: access.session.schoolId },
    select: { id: true, slug: true, name: true },
  })
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 })

  const staffNumber =
    employment.staffNumber && employment.staffNumber.trim()
      ? employment.staffNumber.trim()
      : await generateStaffNumber({ schoolId: school.id, schoolSlug: school.slug })

  // Resolve academic year if assignments include it (or default to current).
  let academicYearId = assignments.academicYearId
  if (!academicYearId && assignments.sectionIds.length > 0) {
    const current = await prisma.academicYear.findFirst({
      where: { schoolId: school.id, isCurrent: true },
      select: { id: true },
    })
    academicYearId = current?.id
  }

  // Validate referenced subjects + sections belong to this school.
  if (assignments.subjectIds.length > 0) {
    const subjectCount = await prisma.subject.count({
      where: { id: { in: assignments.subjectIds }, schoolId: school.id, deletedAt: null },
    })
    if (subjectCount !== assignments.subjectIds.length) {
      return NextResponse.json({ error: "Invalid subject(s)" }, { status: 422 })
    }
  }
  if (assignments.sectionIds.length > 0) {
    const sectionCount = await prisma.section.count({
      where: { id: { in: assignments.sectionIds }, schoolId: school.id, deletedAt: null },
    })
    if (sectionCount !== assignments.sectionIds.length) {
      return NextResponse.json({ error: "Invalid arm(s)" }, { status: 422 })
    }
    if (!academicYearId) {
      return NextResponse.json(
        { error: "No active academic year for section assignments" },
        { status: 422 },
      )
    }
  }

  const passwordHash = await bcrypt.hash(`Welcome-${Date.now()}`, 10)

  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          schoolId: school.id,
          email: personal.email.toLowerCase(),
          phone: personal.phone,
          role: employment.role,
          firstName: personal.firstName,
          lastName: personal.lastName,
          avatarUrl: personal.photoUrl || null,
          passwordHash,
        },
      })

      const staff = await tx.staff.create({
        data: {
          schoolId: school.id,
          userId: user.id,
          staffNumber,
          staffType: employment.staffType,
          status: "ACTIVE",
          hireDate: new Date(employment.hireDate),
          department: employment.department || null,
          qualification: employment.qualification || null,
          experienceYears: employment.experienceYears ?? 0,
          middleName: personal.middleName || null,
          dateOfBirth: personal.dateOfBirth ? new Date(personal.dateOfBirth) : null,
          gender: personal.gender,
          stateOfOrigin: personal.stateOfOrigin || null,
          nin: personal.nin || null,
          bvn: personal.bvn || null,
          salaryGrade: salary.gradeLevel || null,
          basicSalary: salary.basicSalary != null ? new Prisma.Decimal(salary.basicSalary) : null,
          allowances: salary.allowances.length > 0 ? salary.allowances : undefined,
          deductions: salary.deductions.length > 0 ? salary.deductions : undefined,
          bankName: salary.bankName || null,
          accountNumber: salary.accountNumber || null,
          accountName: salary.accountName || null,
        },
      })

      if (assignments.subjectIds.length > 0) {
        await tx.staffSubject.createMany({
          data: assignments.subjectIds.map((subjectId) => ({
            staffId: staff.id,
            subjectId,
          })),
          skipDuplicates: true,
        })
      }

      if (assignments.sectionIds.length > 0 && academicYearId) {
        await tx.staffSectionAssignment.createMany({
          data: assignments.sectionIds.map((sectionId) => ({
            schoolId: school.id,
            staffId: staff.id,
            sectionId,
            academicYearId: academicYearId!,
          })),
          skipDuplicates: true,
        })
      }

      if (documents.length > 0) {
        await tx.staffDocument.createMany({
          data: documents.map((d) => ({
            schoolId: school.id,
            staffId: staff.id,
            kind: d.kind,
            label: d.label || null,
            url: d.url,
          })),
        })
      }

      await tx.auditLog.create({
        data: {
          schoolId: school.id,
          userId: access.session.userId,
          action: "STAFF_REGISTERED",
          entityType: "Staff",
          entityId: staff.id,
        },
      })

      return { staffId: staff.id, staffNumber }
    })

    return NextResponse.json({ ok: true, ...created }, { status: 201 })
  } catch (err) {
    const message =
      err instanceof Error && /Unique constraint/i.test(err.message)
        ? "Staff number or email already in use"
        : "Couldn't create staff"
    console.error("[staff/create]", err)
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
