import { prisma } from "@/lib/db"

import type { PlatformNotice } from "@/components/shared/platform-banner"

// Platform announcements, as the school app sees them.
//
// The console owns these rows; this app only reads. Deliberately narrow — id,
// type and text — so the school app never has to understand plan targeting or
// scheduling, and a change to how announcements are targeted needs no change
// here.

export async function activeNoticesForSchool(schoolId: string): Promise<PlatformNotice[]> {
  const now = new Date()

  const [school, rows] = await Promise.all([
    prisma.school.findFirst({
      where: { id: schoolId, deletedAt: null },
      select: { subscription: { select: { plan: true } } },
    }),
    prisma.platformAnnouncement.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { startsAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        body: true,
        type: true,
        dismissible: true,
        targetPlans: true,
      },
    }),
  ])

  if (!school) return []

  return rows
    .filter((row) => {
      if (row.targetPlans.length === 0) return true
      // A school with no subscription is on no plan, so a plan-targeted
      // announcement does not apply to it.
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
