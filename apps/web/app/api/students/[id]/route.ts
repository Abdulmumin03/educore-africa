import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { resolveStudentAccess, canWriteStudents } from "@/lib/student-access"

export const runtime = "nodejs"

async function ensureAccessible(id: string) {
  const access = await resolveStudentAccess()
  if (!access.ok) return { ok: false as const, response: access.response }
  if (access.visibility.ids && !access.visibility.ids.includes(id)) {
    return { ok: false as const, response: NextResponse.json({ error: "Not found" }, { status: 404 }) }
  }
  return { ok: true as const, access }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await ensureAccessible(params.id)
  if (!g.ok) return g.response

  const s = await prisma.student.findFirst({
    where: { id: params.id, schoolId: g.access.session.schoolId, deletedAt: null },
    include: {
      user: { select: { firstName: true, lastName: true, avatarUrl: true, email: true, phone: true } },
      enrollments: {
        where: { isActive: true, deletedAt: null },
        orderBy: { enrolledOn: "desc" },
        take: 1,
        include: { class: true, section: true, academicYear: true },
      },
      parents: {
        include: {
          parent: {
            include: {
              user: { select: { firstName: true, lastName: true, email: true, phone: true } },
            },
          },
        },
      },
      riskScores: { orderBy: { computedAt: "desc" }, take: 5 },
      feeInvoices: {
        where: { deletedAt: null },
        orderBy: { dueDate: "desc" },
        include: { term: true, payments: { orderBy: { paidAt: "desc" } } },
      },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  })

  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    id: s.id,
    admissionNumber: s.admissionNumber,
    admissionDate: s.admissionDate,
    admissionType: s.admissionType,
    status: s.status,
    firstName: s.user.firstName,
    lastName: s.user.lastName,
    middleName: s.middleName,
    email: s.user.email,
    phone: s.user.phone,
    avatarUrl: s.user.avatarUrl,
    dateOfBirth: s.dateOfBirth,
    gender: s.gender,
    religion: s.religion,
    bloodGroup: s.bloodGroup,
    genotype: s.genotype,
    stateOfOrigin: s.stateOfOrigin,
    lga: s.lga,
    nationality: s.nationality,
    previousSchool: s.previousSchool,
    previousClass: s.previousClass,
    reasonForTransfer: s.reasonForTransfer,
    address: s.address,
    knownAllergies: s.knownAllergies,
    disabilities: s.disabilities,
    specialNeeds: s.specialNeeds,
    doctorName: s.doctorName,
    doctorPhone: s.doctorPhone,
    medicalInsurance: s.medicalInsurance,
    emergencyMedicalConsent: s.emergencyMedicalConsent,
    enrollment: s.enrollments[0]
      ? {
          className: s.enrollments[0].class.name,
          sectionName: s.enrollments[0].section.name,
          academicYearName: s.enrollments[0].academicYear.name,
          enrolledOn: s.enrollments[0].enrolledOn,
        }
      : null,
    guardians: s.parents.map((sp) => ({
      id: sp.parent.id,
      firstName: sp.parent.user.firstName,
      lastName: sp.parent.user.lastName,
      relationship: sp.parent.relationship,
      phone: sp.parent.user.phone,
      email: sp.parent.user.email,
      occupation: sp.parent.occupation,
      address: sp.parent.address,
      isPrimary: sp.isPrimary,
      isEmergencyContact: sp.isEmergencyContact,
      canPickup: sp.canPickup,
    })),
    riskScores: s.riskScores.map((r) => ({
      level: r.level,
      score: r.score,
      computedAt: r.computedAt,
    })),
    feeBalance: s.feeInvoices.reduce(
      (acc, inv) => acc + Math.max(0, Number(inv.amountDue) - Number(inv.amountPaid)),
      0,
    ),
    feeInvoices: s.feeInvoices.map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      amountDue: Number(inv.amountDue),
      amountPaid: Number(inv.amountPaid),
      status: inv.status,
      dueDate: inv.dueDate,
      termType: inv.term.type,
      payments: inv.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        channel: p.channel,
        paidAt: p.paidAt,
      })),
    })),
    documents: s.documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      label: d.label,
      url: d.url,
      createdAt: d.createdAt,
    })),
  })
}

const updateSchema = z.object({
  middleName: z.string().nullable().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  religion: z.string().nullable().optional(),
  stateOfOrigin: z.string().nullable().optional(),
  lga: z.string().nullable().optional(),
  nationality: z.string().optional(),
  bloodGroup: z.string().nullable().optional(),
  genotype: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "GRADUATED", "TRANSFERRED", "WITHDRAWN", "SUSPENDED", "DECEASED"]).optional(),
  photoUrl: z.string().url().nullable().optional(),
})

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (!canWriteStudents(access.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  const data = parsed.data
  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.$transaction([
    prisma.student.update({
      where: { id: student.id },
      data: {
        middleName: data.middleName ?? undefined,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        gender: data.gender,
        religion: data.religion ?? undefined,
        stateOfOrigin: data.stateOfOrigin ?? undefined,
        lga: data.lga ?? undefined,
        nationality: data.nationality,
        bloodGroup: data.bloodGroup ?? undefined,
        genotype: data.genotype ?? undefined,
        address: data.address ?? undefined,
        status: data.status,
      },
    }),
    ...(data.photoUrl !== undefined
      ? [
          prisma.user.update({
            where: { id: student.userId },
            data: { avatarUrl: data.photoUrl },
          }),
        ]
      : []),
  ])

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const access = await resolveStudentAccess()
  if (!access.ok) return access.response
  if (!canWriteStudents(access.session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
  })
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.$transaction([
    prisma.student.update({ where: { id: student.id }, data: { deletedAt: new Date(), status: "WITHDRAWN" } }),
    prisma.enrollment.updateMany({
      where: { studentId: student.id, isActive: true },
      data: { isActive: false },
    }),
    prisma.auditLog.create({
      data: {
        schoolId: access.session.schoolId,
        userId: access.session.userId,
        action: "STUDENT_SOFT_DELETED",
        entityType: "Student",
        entityId: student.id,
      },
    }),
  ])

  return NextResponse.json({ ok: true })
}
