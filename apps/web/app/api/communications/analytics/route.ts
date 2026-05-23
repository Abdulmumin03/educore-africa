import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const VIEW_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const UNCONTACTABLE_FAILURE_THRESHOLD = 3

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!VIEW_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const schoolId = session.user.schoolId

  const [smsByStatus, batchCount, recentBatches, announcementReads, totalParents] = await Promise.all([
    prisma.smsLog.groupBy({
      by: ["status"],
      where: { schoolId },
      _count: { _all: true },
    }),
    prisma.smsBatch.count({ where: { schoolId, deletedAt: null } }),
    prisma.smsBatch.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        audienceLabel: true,
        totalCount: true,
        deliveredCount: true,
        failedCount: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.announcementRead.groupBy({
      by: ["userId"],
      where: {
        announcement: { schoolId, deletedAt: null },
      },
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: 20,
    }),
    prisma.user.count({
      where: { schoolId, role: "PARENT", isActive: true, deletedAt: null },
    }),
  ])

  const smsCounts = { QUEUED: 0, SENT: 0, DELIVERED: 0, FAILED: 0 }
  for (const r of smsByStatus) smsCounts[r.status] = r._count._all
  const smsTotal = smsCounts.QUEUED + smsCounts.SENT + smsCounts.DELIVERED + smsCounts.FAILED
  const smsSuccessRate =
    smsTotal === 0
      ? null
      : Math.round(((smsCounts.SENT + smsCounts.DELIVERED) / smsTotal) * 100)

  // Most-engaged: hydrate userIds with their names + role + email.
  const userIds = announcementReads.map((r) => r.userId)
  const users =
    userIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, role: true, email: true },
        })
  const userById = new Map(users.map((u) => [u.id, u]))
  const mostEngaged = announcementReads
    .map((r) => {
      const u = userById.get(r.userId)
      if (!u) return null
      return {
        userId: u.id,
        name: `${u.firstName} ${u.lastName}`,
        role: u.role,
        email: u.email,
        readCount: r._count._all,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // Uncontactable: phone numbers that have failed >=N times AND never had a SENT/DELIVERED log.
  const failuresByPhone = await prisma.smsLog.groupBy({
    by: ["phone"],
    where: { schoolId, status: "FAILED" },
    _count: { _all: true },
    having: { phone: { _count: { gte: UNCONTACTABLE_FAILURE_THRESHOLD } } },
  })

  const flaggedPhones = failuresByPhone.map((r) => r.phone)
  const everSent =
    flaggedPhones.length === 0
      ? []
      : await prisma.smsLog.findMany({
          where: {
            schoolId,
            phone: { in: flaggedPhones },
            status: { in: ["SENT", "DELIVERED"] },
          },
          distinct: ["phone"],
          select: { phone: true },
        })
  const everSentSet = new Set(everSent.map((r) => r.phone))
  const truly = failuresByPhone.filter((r) => !everSentSet.has(r.phone))

  // Hydrate the flagged phones with user info where we can find a match.
  const usersByPhone =
    truly.length === 0
      ? []
      : await prisma.user.findMany({
          where: { schoolId, phone: { in: truly.map((r) => r.phone) } },
          select: { id: true, firstName: true, lastName: true, role: true, phone: true },
        })
  const userByPhone = new Map(usersByPhone.map((u) => [u.phone!, u]))
  const uncontactable = truly.map((r) => {
    const u = userByPhone.get(r.phone)
    return {
      phone: r.phone,
      failureCount: r._count._all,
      userId: u?.id ?? null,
      name: u ? `${u.firstName} ${u.lastName}` : null,
      role: u?.role ?? null,
    }
  })

  return NextResponse.json({
    sms: {
      counts: smsCounts,
      total: smsTotal,
      successRate: smsSuccessRate,
      batches: batchCount,
      recentBatches: recentBatches.map((b) => ({
        id: b.id,
        audience: b.audienceLabel,
        total: b.totalCount,
        delivered: b.deliveredCount,
        failed: b.failedCount,
        status: b.status,
        createdAt: b.createdAt.toISOString(),
      })),
    },
    mostEngaged,
    uncontactable,
    parents: { total: totalParents, uncontactable: uncontactable.length },
  })
}
