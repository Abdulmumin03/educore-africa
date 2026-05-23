import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveStudentAccess, canWriteStudents } from "@/lib/student-access"
import { registerStudentSchema } from "@/lib/student-schemas"
import { generateAdmissionNumber } from "@/lib/admission-number"
import { sendSms } from "@/lib/sms"

export const runtime = "nodejs"

// ─── LIST ──────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1))
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)))
  const search = (url.searchParams.get("search") ?? "").trim()
  const classId = url.searchParams.get("classId") ?? undefined
  const sectionId = url.searchParams.get("sectionId") ?? undefined
  const gender = url.searchParams.get("gender") as "MALE" | "FEMALE" | "OTHER" | null
  const status = url.searchParams.get("status") as
    | "ACTIVE"
    | "GRADUATED"
    | "TRANSFERRED"
    | "WITHDRAWN"
    | "SUSPENDED"
    | "DECEASED"
    | null
  const feeStatus = url.searchParams.get("feeStatus") as
    | "PENDING"
    | "PARTIAL"
    | "PAID"
    | "OVERDUE"
    | "WAIVED"
    | null

  const baseWhere: Prisma.StudentWhereInput = {
    schoolId: access.session.schoolId,
    deletedAt: null,
    ...(gender ? { gender } : {}),
    ...(status ? { status } : {}),
    ...(access.visibility.ids ? { id: { in: access.visibility.ids } } : {}),
  }

  if (search.length >= 1) {
    baseWhere.OR = [
      { admissionNumber: { contains: search, mode: "insensitive" } },
      { user: { firstName: { contains: search, mode: "insensitive" } } },
      { user: { lastName: { contains: search, mode: "insensitive" } } },
      { middleName: { contains: search, mode: "insensitive" } },
    ]
  }

  if (classId || sectionId) {
    baseWhere.enrollments = {
      some: {
        isActive: true,
        deletedAt: null,
        ...(classId ? { classId } : {}),
        ...(sectionId ? { sectionId } : {}),
      },
    }
  }

  if (feeStatus) {
    baseWhere.feeInvoices = {
      some: { status: feeStatus, deletedAt: null },
    }
  }

  const [total, rows] = await Promise.all([
    prisma.student.count({ where: baseWhere }),
    prisma.student.findMany({
      where: baseWhere,
      orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { firstName: true, lastName: true, avatarUrl: true, email: true } },
        enrollments: {
          where: { isActive: true, deletedAt: null },
          orderBy: { enrolledOn: "desc" },
          take: 1,
          include: { class: true, section: true },
        },
        feeInvoices: {
          where: { deletedAt: null },
          orderBy: { dueDate: "desc" },
          take: 5,
          select: { amountDue: true, amountPaid: true, status: true },
        },
      },
    }),
  ])

  const items = rows.map((s) => {
    const owed = s.feeInvoices.reduce(
      (acc, inv) =>
        acc + Math.max(0, Number(inv.amountDue) - Number(inv.amountPaid)),
      0,
    )
    return {
      id: s.id,
      admissionNumber: s.admissionNumber,
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      middleName: s.middleName,
      avatarUrl: s.user.avatarUrl,
      gender: s.gender,
      status: s.status,
      className: s.enrollments[0]?.class.name ?? null,
      sectionName: s.enrollments[0]?.section.name ?? null,
      balance: owed,
    }
  })

  // Quick stats — scoped to same filters minus pagination.
  const visibleWhere = { schoolId: access.session.schoolId, deletedAt: null }
  const startOfTerm = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId: access.session.schoolId } },
    select: { startDate: true },
  })
  const [statTotal, statBoys, statGirls, statNew] = await Promise.all([
    prisma.student.count({ where: visibleWhere }),
    prisma.student.count({ where: { ...visibleWhere, gender: "MALE" } }),
    prisma.student.count({ where: { ...visibleWhere, gender: "FEMALE" } }),
    startOfTerm
      ? prisma.student.count({
          where: { ...visibleWhere, admissionDate: { gte: startOfTerm.startDate } },
        })
      : Promise.resolve(0),
  ])

  return NextResponse.json({
    items,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    stats: { total: statTotal, boys: statBoys, girls: statGirls, newThisTerm: statNew },
  })
}

// ─── CREATE ────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (!canWriteStudents(access.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = registerStudentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { personal, academic, guardians, health } = parsed.data

  const school = await prisma.school.findUnique({
    where: { id: access.session.schoolId },
    select: { slug: true, name: true },
  })
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 })

  // Verify the chosen class+section+academic year belong to this school.
  const [klass, section, academicYear] = await Promise.all([
    prisma.class.findFirst({ where: { id: academic.classId, schoolId: access.session.schoolId } }),
    prisma.section.findFirst({ where: { id: academic.sectionId, schoolId: access.session.schoolId } }),
    prisma.academicYear.findFirst({
      where: { id: academic.academicYearId, schoolId: access.session.schoolId },
    }),
  ])
  if (!klass || !section || !academicYear) {
    return NextResponse.json({ error: "Invalid class / section / session" }, { status: 422 })
  }
  if (section.classId !== klass.id) {
    return NextResponse.json({ error: "Arm doesn't belong to class" }, { status: 422 })
  }

  const admissionNumber =
    personal.admissionNumber && personal.admissionNumber.trim()
      ? personal.admissionNumber.trim()
      : await generateAdmissionNumber({
          schoolId: access.session.schoolId,
          schoolSlug: school.slug,
        })

  // Each student gets a User row; admission number doubles as the local-part of the placeholder email
  // until the school assigns one.
  const placeholderEmail = `${admissionNumber.toLowerCase()}@${school.slug}.educore`

  try {
    const created = await prisma.$transaction(async (tx) => {
      const studentUser = await tx.user.create({
        data: {
          schoolId: access.session.schoolId,
          email: placeholderEmail,
          role: "STUDENT",
          firstName: personal.firstName,
          lastName: personal.lastName,
          avatarUrl: personal.photoUrl || null,
        },
      })

      const student = await tx.student.create({
        data: {
          schoolId: access.session.schoolId,
          userId: studentUser.id,
          admissionNumber,
          admissionDate: new Date(personal.admissionDate),
          admissionType: academic.admissionType,
          middleName: personal.middleName || null,
          dateOfBirth: new Date(personal.dateOfBirth),
          gender: personal.gender,
          religion: personal.religion || null,
          stateOfOrigin: personal.stateOfOrigin || null,
          lga: personal.lga || null,
          nationality: personal.nationality || "Nigerian",
          bloodGroup: personal.bloodGroup || null,
          genotype: personal.genotype || null,
          previousSchool: academic.previousSchool || null,
          previousClass: academic.previousClass || null,
          reasonForTransfer: academic.reasonForTransfer || null,
          knownAllergies: health.knownAllergies || null,
          disabilities: health.disabilities || null,
          specialNeeds: health.specialNeeds || null,
          doctorName: health.doctorName || null,
          doctorPhone: health.doctorPhone || null,
          medicalInsurance: health.medicalInsurance || null,
          emergencyMedicalConsent: health.emergencyMedicalConsent,
          status: "ACTIVE",
        },
      })

      await tx.enrollment.create({
        data: {
          schoolId: access.session.schoolId,
          studentId: student.id,
          classId: klass.id,
          sectionId: section.id,
          academicYearId: academicYear.id,
        },
      })

      // Guardians: link existing parent (by id) or create new User + Parent.
      const tempPasswordHash = await bcrypt.hash(`Guardian-${Date.now()}`, 10)
      for (const g of guardians) {
        let parentId = g.parentId
        if (parentId) {
          const existing = await tx.parent.findFirst({
            where: { id: parentId, schoolId: access.session.schoolId },
          })
          if (!existing) parentId = undefined
        }
        if (!parentId) {
          // Look up an existing user with this phone within the school first.
          const existingUser = await tx.user.findFirst({
            where: { schoolId: access.session.schoolId, phone: g.phone, role: "PARENT" },
          })
          let parentUserId: string
          if (existingUser) {
            parentUserId = existingUser.id
          } else {
            const newUser = await tx.user.create({
              data: {
                schoolId: access.session.schoolId,
                email: g.email || `${g.phone.replace(/\D/g, "")}@${school.slug}.parents.educore`,
                phone: g.phone,
                role: "PARENT",
                firstName: g.firstName,
                lastName: g.lastName,
                passwordHash: tempPasswordHash,
              },
            })
            parentUserId = newUser.id
          }
          const existingParent = await tx.parent.findFirst({ where: { userId: parentUserId } })
          if (existingParent) {
            parentId = existingParent.id
          } else {
            const newParent = await tx.parent.create({
              data: {
                schoolId: access.session.schoolId,
                userId: parentUserId,
                relationship: g.relationship,
                occupation: g.occupation || null,
                address: g.address || null,
              },
            })
            parentId = newParent.id
          }
        }

        await tx.studentParent.upsert({
          where: { studentId_parentId: { studentId: student.id, parentId } },
          update: {
            isPrimary: g.isPrimary,
            isEmergencyContact: g.isEmergencyContact,
            canPickup: g.canPickup,
          },
          create: {
            studentId: student.id,
            parentId,
            isPrimary: g.isPrimary,
            isEmergencyContact: g.isEmergencyContact,
            canPickup: g.canPickup,
          },
        })
      }

      await tx.auditLog.create({
        data: {
          schoolId: access.session.schoolId,
          userId: access.session.userId,
          action: "STUDENT_REGISTERED",
          entityType: "Student",
          entityId: student.id,
        },
      })

      return { studentId: student.id, admissionNumber, guardians }
    })

    // Best-effort welcome SMS to the primary guardian.
    const primary =
      guardians.find((g) => g.isPrimary) ?? guardians[0]
    if (primary) {
      void sendSms(
        primary.phone,
        `Welcome to ${school.name}! Your child has been admitted with admission no. ${admissionNumber}.`,
      )
    }

    return NextResponse.json({ ok: true, ...created })
  } catch (err) {
    const message =
      err instanceof Error && /Unique constraint/i.test(err.message)
        ? "Admission number already in use"
        : "Couldn't create student"
    console.error("[students/create]", err)
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
