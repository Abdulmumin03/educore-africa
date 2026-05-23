import { prisma } from "@/lib/db"
import { resolveStaffAccess } from "@/lib/staff-access"
import { renderPayslipPdf } from "@/lib/payslip-pdf"

export const runtime = "nodejs"
// Avoid edge caching — PDFs are stamped with "generated at" timestamp.
export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: { id: string; payslipId: string } },
) {
  const access = await resolveStaffAccess()
  if (!access.ok) return access.response

  const payslip = await prisma.payslip.findFirst({
    where: {
      id: params.payslipId,
      staffId: params.id,
      schoolId: access.session.schoolId,
      deletedAt: null,
    },
    include: {
      staff: {
        select: {
          id: true,
          userId: true,
          staffNumber: true,
          department: true,
          bankName: true,
          accountNumber: true,
          accountName: true,
          user: { select: { firstName: true, lastName: true, role: true } },
        },
      },
      payrollPeriod: { select: { name: true, startDate: true, endDate: true } },
      school: {
        select: { name: true, address: true, phone: true, email: true, logoUrl: true },
      },
    },
  })
  if (!payslip) return new Response("Not found", { status: 404 })

  // Staff may only fetch their own; admins/bursars may fetch anyone's.
  const isSelf = payslip.staff.userId === access.session.userId
  const isPrivileged = ["SUPER_ADMIN", "SCHOOL_ADMIN", "BURSAR", "PRINCIPAL"].includes(
    access.session.role,
  )
  if (!isSelf && !isPrivileged) return new Response("Forbidden", { status: 403 })

  const pdf = await renderPayslipPdf({
    school: payslip.school,
    staff: {
      name: `${payslip.staff.user.firstName} ${payslip.staff.user.lastName}`,
      staffNumber: payslip.staff.staffNumber,
      role: payslip.staff.user.role,
      department: payslip.staff.department,
      bankName: payslip.staff.bankName,
      accountNumber: payslip.staff.accountNumber,
      accountName: payslip.staff.accountName,
    },
    period: {
      name: payslip.payrollPeriod.name,
      startDate: payslip.payrollPeriod.startDate.toISOString(),
      endDate: payslip.payrollPeriod.endDate.toISOString(),
    },
    basicSalary: Number(payslip.basicSalary),
    allowances: (payslip.allowances ?? []) as { name: string; amount: number }[],
    deductions: (payslip.deductions ?? []) as { name: string; amount: number }[],
    gross: Number(payslip.gross),
    net: Number(payslip.net),
    paidAt: payslip.paidAt?.toISOString() ?? null,
    note: payslip.note,
    generatedAt: new Date().toISOString(),
  })

  const filename = `payslip-${payslip.staff.staffNumber}-${payslip.payrollPeriod.name}.pdf`
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
