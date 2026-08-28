import { createHash } from "node:crypto"
import type { DataRequestStatus, DataRequestType } from "@prisma/client"

import { prisma } from "@/lib/db"

// NDPR data subject requests.
//
// Nigeria's Data Protection Regulation gives a controller 30 days to answer.
// The clock is stored on the row rather than computed on read: changing the
// statutory window later must not silently re-date requests already in flight.

export const NDPR_RESPONSE_DAYS = 30

export type RequestRow = {
  id: string
  type: DataRequestType
  status: DataRequestStatus
  subjectName: string
  subjectEmail: string
  schoolId: string | null
  school: string | null
  details: string | null
  receivedAt: string
  dueAt: string
  completedAt: string | null
  resolution: string | null
  handledBy: string | null
  /** Negative once the statutory window has passed. */
  daysRemaining: number
  overdue: boolean
  deletions: number
}

export function dueDateFor(receivedAt: Date): Date {
  return new Date(receivedAt.getTime() + NDPR_RESPONSE_DAYS * 86_400_000)
}

export async function listRequests(options: { status?: DataRequestStatus } = {}) {
  const rows = await prisma.dataSubjectRequest.findMany({
    where: options.status ? { status: options.status } : {},
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    select: {
      id: true,
      type: true,
      status: true,
      subjectName: true,
      subjectEmail: true,
      schoolId: true,
      details: true,
      receivedAt: true,
      dueAt: true,
      completedAt: true,
      resolution: true,
      handledById: true,
      _count: { select: { deletions: true } },
    },
  })

  const [schools, handlers] = await Promise.all([
    prisma.school.findMany({
      where: { id: { in: rows.map((row) => row.schoolId).filter((id): id is string => Boolean(id)) } },
      select: { id: true, name: true },
    }),
    prisma.superAdminUser.findMany({
      where: { id: { in: rows.map((row) => row.handledById).filter((id): id is string => Boolean(id)) } },
      select: { id: true, name: true },
    }),
  ])
  const schoolNames = new Map(schools.map((school) => [school.id, school.name]))
  const handlerNames = new Map(handlers.map((handler) => [handler.id, handler.name]))

  const now = Date.now()

  const list: RequestRow[] = rows.map((row) => {
    // A settled request has no countdown — it either met the window or it did
    // not, and that verdict should stop moving.
    const reference = row.completedAt ?? new Date(now)
    const daysRemaining = Math.ceil((row.dueAt.getTime() - reference.getTime()) / 86_400_000)

    return {
      id: row.id,
      type: row.type,
      status: row.status,
      subjectName: row.subjectName,
      subjectEmail: row.subjectEmail,
      schoolId: row.schoolId,
      school: row.schoolId ? (schoolNames.get(row.schoolId) ?? null) : null,
      details: row.details,
      receivedAt: row.receivedAt.toISOString(),
      dueAt: row.dueAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      resolution: row.resolution,
      handledBy: row.handledById ? (handlerNames.get(row.handledById) ?? "Unknown") : null,
      daysRemaining,
      overdue: daysRemaining < 0,
      deletions: row._count.deletions,
    }
  })

  const open = list.filter((row) => row.status === "RECEIVED" || row.status === "IN_PROGRESS")

  return {
    requests: list,
    summary: {
      total: list.length,
      open: open.length,
      overdue: open.filter((row) => row.overdue).length,
      dueThisWeek: open.filter((row) => row.daysRemaining >= 0 && row.daysRemaining <= 7).length,
      completed: list.filter((row) => row.status === "COMPLETED").length,
    },
  }
}

export type DeletionSummary = Record<string, number>

/**
 * Anonymise a data subject, in place.
 *
 * Deliberately NOT a hard delete. A student row is referenced by attendance,
 * grades, invoices and report cards; deleting it would either cascade a
 * school's academic history away or fail on a foreign key. NDPR erasure is
 * satisfied by removing the identifying fields, which is what this does —
 * the rows survive as unattributable records.
 *
 * The one exception is sessions and notifications, which carry no historical
 * value and are removed outright.
 */
export async function executeDeletion(input: {
  requestId: string
  userId: string
  executedById: string
}): Promise<
  | { ok: true; summary: DeletionSummary; method: string }
  | { ok: false; message: string }
> {
  const request = await prisma.dataSubjectRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, type: true, status: true, schoolId: true },
  })
  if (!request) return { ok: false, message: "Request not found." }
  if (request.type !== "DELETION") {
    return { ok: false, message: "Only a DELETION request can be executed." }
  }
  if (request.status === "COMPLETED") {
    return { ok: false, message: "This request has already been executed." }
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      schoolId: true,
      student: { select: { id: true, dateOfBirth: true } },
      staff: { select: { id: true } },
      parent: { select: { id: true } },
    },
  })
  if (!user) return { ok: false, message: "That user record no longer exists." }

  // A stable, irreversible handle so the anonymised rows stay distinct from
  // one another without carrying anything identifying.
  const handle = createHash("sha256").update(user.id).digest("hex").slice(0, 12)
  const summary: DeletionSummary = {}

  await prisma.$transaction(async (tx) => {
    const sessions = await tx.session.deleteMany({ where: { userId: user.id } })
    summary.sessions_deleted = sessions.count

    const notifications = await tx.notification.deleteMany({ where: { userId: user.id } })
    summary.notifications_deleted = notifications.count

    await tx.user.update({
      where: { id: user.id },
      data: {
        email: `erased-${handle}@deleted.invalid`,
        firstName: "Erased",
        lastName: "Subject",
        phone: null,
        avatarUrl: null,
        passwordHash: null,
        emailVerified: null,
        isActive: false,
        deletedAt: new Date(),
      },
    })
    summary.user_anonymised = 1

    if (user.student) {
      // dateOfBirth and gender are non-nullable on Student, so the date is
      // COARSENED to the 1st of January of the same year — the standard
      // k-anonymity step — rather than replaced with a made-up date. Medical
      // notes go entirely: they are the most sensitive thing on the row.
      const dob = user.student.dateOfBirth
      await tx.student.update({
        where: { id: user.student.id },
        data: {
          dateOfBirth: new Date(Date.UTC(dob.getUTCFullYear(), 0, 1)),
          middleName: null,
          religion: null,
          stateOfOrigin: null,
          lga: null,
          previousSchool: null,
          bloodGroup: null,
          genotype: null,
          medicalNotes: null,
          knownAllergies: null,
          disabilities: null,
          specialNeeds: null,
          doctorName: null,
          doctorPhone: null,
          medicalInsurance: null,
          address: null,
          emergencyContact: null,
        },
      })
      summary.student_profile_anonymised = 1
      summary.student_dob_coarsened_to_year = 1
    }

    if (user.staff) {
      await tx.staff.update({
        where: { id: user.staff.id },
        data: {
          dateOfBirth: null,
          gender: null,
          middleName: null,
          stateOfOrigin: null,
          nin: null,
          bvn: null,
          bankName: null,
          accountNumber: null,
          accountName: null,
        },
      })
      summary.staff_profile_anonymised = 1
    }

    if (user.parent) {
      summary.parent_profile_retained_by_link = 1
    }

    await tx.dataDeletionRecord.create({
      data: {
        requestId: request.id,
        schoolId: user.schoolId,
        summary,
        method: "anonymise",
        executedById: input.executedById,
      },
    })

    await tx.dataSubjectRequest.update({
      where: { id: request.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        userId: user.id,
        handledById: input.executedById,
        resolution:
          "Identifying fields removed and the account disabled. Academic and financial rows were retained without attribution — deleting them would erase the school's own records.",
      },
    })
  })

  return { ok: true, summary, method: "anonymise" }
}

export async function listDeletionRecords() {
  const rows = await prisma.dataDeletionRecord.findMany({
    orderBy: { executedAt: "desc" },
    take: 100,
    select: {
      id: true,
      schoolId: true,
      summary: true,
      method: true,
      executedById: true,
      executedAt: true,
      request: {
        select: { id: true, subjectName: true, subjectEmail: true, type: true, status: true },
      },
    },
  })

  const [schools, staff] = await Promise.all([
    prisma.school.findMany({
      where: { id: { in: rows.map((row) => row.schoolId).filter((id): id is string => Boolean(id)) } },
      select: { id: true, name: true },
    }),
    prisma.superAdminUser.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.executedById))] } },
      select: { id: true, name: true },
    }),
  ])
  const schoolNames = new Map(schools.map((school) => [school.id, school.name]))
  const staffNames = new Map(staff.map((person) => [person.id, person.name]))

  return rows.map((row) => ({
    id: row.id,
    requestId: row.request.id,
    subjectName: row.request.subjectName,
    subjectEmail: row.request.subjectEmail,
    school: row.schoolId ? (schoolNames.get(row.schoolId) ?? null) : null,
    summary: row.summary as DeletionSummary,
    method: row.method,
    executedBy: staffNames.get(row.executedById) ?? "Unknown",
    executedAt: row.executedAt.toISOString(),
  }))
}
