import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import { sendSms } from "@/lib/sms"

/**
 * USSD menu state machine for Africa's Talking. The protocol is stateless on
 * AT's side — they send the full input chain (`text`, `*`-delimited) every
 * turn. We still cache parsed school + session metadata in Redis to avoid
 * looking up the school on every step.
 *
 * Response format:
 *   "CON ..." → keep the session open, expect more input
 *   "END ..." → terminate the session, display final message
 */

export type UssdInput = {
  sessionId: string
  phoneNumber: string
  serviceCode: string
  text: string
}

const SESSION_TTL_SECONDS = 10 * 60 // 10 min per spec
const sessionKey = (id: string) => `ussd:${id}`

/** Extract the school's USSD code from the service code dial pattern. */
export function parseUssdCode(serviceCode: string): string | null {
  // "*123*4567#" → "4567" (last segment between * and #)
  const m = serviceCode.match(/\*([^*#]+)#$/)
  return m ? m[1] : null
}

/** Split the input chain into segments. Empty text = no input yet. */
export function parseInputs(text: string): string[] {
  if (!text) return []
  return text.split("*")
}

type SchoolCtx = {
  id: string
  name: string
  phone: string | null
}

async function resolveSchool(serviceCode: string): Promise<SchoolCtx | null> {
  const code = parseUssdCode(serviceCode)
  if (!code) return null
  const school = await prisma.school.findFirst({
    where: { ussdCode: code, deletedAt: null },
    select: { id: true, name: true, phone: true },
  })
  return school
}

function mainMenu(schoolName: string): string {
  return [
    `CON Welcome to ${schoolName}`,
    "1. Check fee balance",
    "2. View results",
    "3. Attendance summary",
    "4. Contact school",
    "0. Exit",
  ].join("\n")
}

async function lookupStudent(
  schoolId: string,
  admissionNumber: string,
) {
  return prisma.student.findFirst({
    where: {
      schoolId,
      admissionNumber: admissionNumber.trim(),
      deletedAt: null,
    },
    include: {
      user: { select: { firstName: true, lastName: true } },
      enrollments: {
        where: { isActive: true, deletedAt: null },
        select: { class: { select: { name: true } } },
        take: 1,
      },
    },
  })
}

async function feeBalanceReply(
  schoolId: string,
  admissionNumber: string,
): Promise<string> {
  const student = await lookupStudent(schoolId, admissionNumber)
  if (!student) return "END Admission number not found."

  const [invAgg, lastPayment] = await Promise.all([
    prisma.feeInvoice.aggregate({
      where: { schoolId, studentId: student.id, deletedAt: null },
      _sum: { amountDue: true, amountPaid: true },
    }),
    prisma.payment.findFirst({
      where: {
        schoolId,
        invoice: { studentId: student.id },
        deletedAt: null,
      },
      orderBy: { paidAt: "desc" },
      select: { amount: true, paidAt: true },
    }),
  ])

  const billed = Number(invAgg._sum?.amountDue ?? 0)
  const paid = Number(invAgg._sum?.amountPaid ?? 0)
  const outstanding = Math.max(0, billed - paid)
  const klass = student.enrollments[0]?.class.name ?? ""
  const name = `${student.user.firstName} ${student.user.lastName}`

  const lines = [
    `END Balance for ${name}${klass ? ` (${klass})` : ""}:`,
    `Outstanding: NGN ${outstanding.toLocaleString()}`,
  ]
  if (lastPayment) {
    const d = lastPayment.paidAt
    const dd = String(d.getDate()).padStart(2, "0")
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const yy = String(d.getFullYear()).slice(2)
    lines.push(`Last paid: NGN ${Number(lastPayment.amount).toLocaleString()} on ${dd}/${mm}/${yy}`)
  }
  return lines.join("\n")
}

async function resultsReply(
  schoolId: string,
  admissionNumber: string,
): Promise<string> {
  const student = await lookupStudent(schoolId, admissionNumber)
  if (!student) return "END Admission number not found."

  const currentTerm = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId } },
    select: { id: true, type: true, academicYear: { select: { name: true } } },
  })
  if (!currentTerm) return "END No active term."

  const grades = await prisma.grade.findMany({
    where: {
      studentId: student.id,
      termId: currentTerm.id,
      deletedAt: null,
    },
    include: { subject: { select: { code: true } } },
    take: 6, // keep SMS-sized
  })

  if (grades.length === 0) {
    return `END No results recorded yet for ${currentTerm.type} term.`
  }

  const name = `${student.user.firstName} ${student.user.lastName}`
  const klass = student.enrollments[0]?.class.name ?? ""
  const lines = grades
    .map((g) => `${g.subject.code}: ${g.letterGrade ?? g.totalScore}`)
    .join(" | ")
  const position = grades[0]?.position
  return [
    `END ${name}${klass ? ` (${klass})` : ""} ${currentTerm.type}:`,
    lines,
    position ? `Position: ${position}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

async function attendanceReply(
  schoolId: string,
  admissionNumber: string,
): Promise<string> {
  const student = await lookupStudent(schoolId, admissionNumber)
  if (!student) return "END Admission number not found."

  const term = await prisma.term.findFirst({
    where: { isCurrent: true, academicYear: { schoolId } },
    select: { startDate: true, endDate: true, type: true },
  })
  if (!term) return "END No active term."

  const rows = await prisma.attendance.findMany({
    where: {
      schoolId,
      studentId: student.id,
      deletedAt: null,
      date: { gte: term.startDate, lte: term.endDate },
    },
    select: { status: true },
  })

  if (rows.length === 0) {
    return "END No attendance recorded this term yet."
  }
  const present = rows.filter((r) => r.status === "PRESENT").length
  const absent = rows.filter((r) => r.status === "ABSENT").length
  const total = rows.length
  const pct = Math.round((present / total) * 100)
  const name = `${student.user.firstName} ${student.user.lastName}`
  return [
    `END ${name} attendance this term: ${pct}%`,
    `Absent ${absent} of ${total} school days`,
  ].join("\n")
}

async function contactSchoolReply(
  schoolId: string,
  schoolPhone: string | null,
  callerPhone: string,
): Promise<string> {
  if (schoolPhone) {
    // Fire-and-forget — workflow shouldn't fail because SMS provider is down.
    void sendSms(
      schoolPhone,
      `Parent inquiry from ${callerPhone} via USSD. Please call them back.`,
    ).catch((err) => console.error("[ussd] contact SMS failed", err))
  }
  // Audit the request so the front desk can find it later.
  await prisma.auditLog
    .create({
      data: {
        schoolId,
        action: "ussd.contact-request",
        entityType: "School",
        entityId: schoolId,
        payload: { phoneNumber: callerPhone },
      },
    })
    .catch((err) => console.error("[ussd] audit log failed", err))
  return [
    "END Thank you. The school has been notified",
    "and will call you back shortly.",
  ].join("\n")
}

/**
 * Drive a single USSD turn. Returns the AT response body (string starting
 * with `CON ` or `END `). Never throws — any internal error becomes an END
 * with a friendly message so AT doesn't see a 500.
 */
export async function handleUssdTurn(input: UssdInput): Promise<string> {
  try {
    // Try the cached school context first; fall back to a DB lookup.
    let school: SchoolCtx | null = null
    const cached = await redis.get(sessionKey(input.sessionId)).catch(() => null)
    if (cached) {
      try {
        school = JSON.parse(cached) as SchoolCtx
      } catch {
        /* ignore */
      }
    }
    if (!school) {
      school = await resolveSchool(input.serviceCode)
      if (school) {
        await redis
          .set(
            sessionKey(input.sessionId),
            JSON.stringify(school),
            "EX",
            SESSION_TTL_SECONDS,
          )
          .catch((err) => console.error("[ussd] redis set failed", err))
      }
    }

    if (!school) {
      return "END School not recognised. Check the code and try again."
    }

    const inputs = parseInputs(input.text)

    // Top-level menu
    if (inputs.length === 0) {
      return mainMenu(school.name)
    }

    const first = inputs[0]
    switch (first) {
      case "0":
        return "END Goodbye."
      case "1": {
        if (inputs.length === 1) return "CON Enter ward's admission number:"
        return feeBalanceReply(school.id, inputs[1])
      }
      case "2": {
        if (inputs.length === 1) return "CON Enter ward's admission number:"
        return resultsReply(school.id, inputs[1])
      }
      case "3": {
        if (inputs.length === 1) return "CON Enter ward's admission number:"
        return attendanceReply(school.id, inputs[1])
      }
      case "4":
        return contactSchoolReply(school.id, school.phone, input.phoneNumber)
      default:
        return mainMenu(school.name)
    }
  } catch (err) {
    console.error("[ussd] unexpected error", err)
    return "END Something went wrong. Please try again."
  }
}
