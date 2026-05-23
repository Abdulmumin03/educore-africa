import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { resolveStudentAccess } from "@/lib/student-access"
import { StudentProfile } from "@/components/dashboard/students/profile/student-profile"

export const metadata = { title: "Student profile · EduCore Africa" }

export default async function StudentProfilePage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")

  const access = await resolveStudentAccess()
  if (!access.ok) redirect("/dashboard")
  if (access.visibility.ids && !access.visibility.ids.includes(params.id)) notFound()

  const s = await prisma.student.findFirst({
    where: { id: params.id, schoolId: access.session.schoolId, deletedAt: null },
    include: {
      user: { select: { firstName: true, lastName: true, avatarUrl: true, email: true, phone: true } },
      enrollments: {
        where: { isActive: true, deletedAt: null },
        orderBy: { enrolledOn: "desc" },
        take: 1,
        include: { class: true, section: true, academicYear: true },
      },
      parents: {
        include: { parent: { include: { user: true } } },
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

  if (!s) notFound()

  const canWrite = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "COUNSELOR"].includes(
    session.user.role,
  )

  return (
    <StudentProfile
      canWrite={canWrite}
      student={{
        id: s.id,
        admissionNumber: s.admissionNumber,
        admissionDate: s.admissionDate.toISOString(),
        admissionType: s.admissionType,
        status: s.status,
        firstName: s.user.firstName,
        lastName: s.user.lastName,
        middleName: s.middleName,
        avatarUrl: s.user.avatarUrl,
        email: s.user.email,
        phone: s.user.phone,
        dateOfBirth: s.dateOfBirth.toISOString(),
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
              enrolledOn: s.enrollments[0].enrolledOn.toISOString(),
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
          computedAt: r.computedAt.toISOString(),
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
          dueDate: inv.dueDate.toISOString(),
          termType: inv.term.type,
          payments: inv.payments.map((p) => ({
            id: p.id,
            amount: Number(p.amount),
            channel: p.channel,
            paidAt: p.paidAt.toISOString(),
          })),
        })),
        documents: s.documents.map((d) => ({
          id: d.id,
          kind: d.kind,
          label: d.label,
          url: d.url,
          createdAt: d.createdAt.toISOString(),
        })),
      }}
    />
  )
}
