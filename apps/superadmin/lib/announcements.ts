import type { PlatformAnnouncementType, SchoolPlan } from "@prisma/client"

import { prisma } from "@/lib/db"

// Persistent platform announcements.
//
// Distinct from a Broadcast (SA-07) on purpose: a broadcast writes one
// notification and is done, this stays on screen inside school dashboards for
// its whole window. Maintenance notices belong here; "we shipped a feature"
// belongs in a broadcast.

export type AnnouncementRow = {
  id: string
  title: string
  body: string
  type: PlatformAnnouncementType
  startsAt: string
  endsAt: string | null
  targetPlans: SchoolPlan[]
  isActive: boolean
  dismissible: boolean
  createdAt: string
  createdBy: string
  /** Where it sits relative to now, so the list can group without re-deriving. */
  window: "scheduled" | "live" | "ended" | "off"
  /** Schools that will actually see it. */
  reach: number
}

function windowFor(row: {
  isActive: boolean
  startsAt: Date
  endsAt: Date | null
}): AnnouncementRow["window"] {
  if (!row.isActive) return "off"
  const now = new Date()
  if (row.startsAt > now) return "scheduled"
  if (row.endsAt && row.endsAt <= now) return "ended"
  return "live"
}

export async function listAnnouncements(): Promise<AnnouncementRow[]> {
  const [rows, planCounts, totalSchools] = await Promise.all([
    prisma.platformAnnouncement.findMany({
      orderBy: [{ isActive: "desc" }, { startsAt: "desc" }],
      take: 50,
    }),
    prisma.schoolSubscription.groupBy({
      by: ["plan"],
      where: { school: { deletedAt: null } },
      _count: { _all: true },
    }),
    prisma.school.count({ where: { deletedAt: null } }),
  ])

  const byPlan = new Map(planCounts.map((entry) => [entry.plan, entry._count._all]))

  const authorIds = [...new Set(rows.map((row) => row.createdById))]
  const authors = await prisma.superAdminUser.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true },
  })
  const names = new Map(authors.map((author) => [author.id, author.name]))

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    targetPlans: row.targetPlans,
    isActive: row.isActive,
    dismissible: row.dismissible,
    createdAt: row.createdAt.toISOString(),
    createdBy: names.get(row.createdById) ?? "Unknown",
    window: windowFor(row),
    reach:
      row.targetPlans.length === 0
        ? totalSchools
        : row.targetPlans.reduce((sum, plan) => sum + (byPlan.get(plan) ?? 0), 0),
  }))
}

/**
 * What a given school should currently see.
 *
 * This is the function apps/web calls. Kept deliberately narrow — id, type and
 * text — so the school app never has to understand targeting.
 */
export async function activeForSchool(schoolId: string): Promise<
  Array<{
    id: string
    title: string
    body: string
    type: PlatformAnnouncementType
    dismissible: boolean
  }>
> {
  const school = await prisma.school.findFirst({
    where: { id: schoolId, deletedAt: null },
    select: { subscription: { select: { plan: true } } },
  })
  if (!school) return []

  const now = new Date()
  const rows = await prisma.platformAnnouncement.findMany({
    where: {
      isActive: true,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      title: true,
      body: true,
      type: true,
      dismissible: true,
      targetPlans: true,
    },
  })

  return rows
    .filter((row) => {
      if (row.targetPlans.length === 0) return true
      // A school with no subscription row is not on any plan, so a
      // plan-targeted announcement does not apply to it.
      return school.subscription ? row.targetPlans.includes(school.subscription.plan) : false
    })
    .map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      type: row.type,
      dismissible: row.dismissible,
    }))
}
