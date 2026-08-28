import { prisma } from "@/lib/db"
import { PlansEditor, type PlanRow } from "../plans-editor"

export async function PlansTab() {
  const [configs, subscribers] = await Promise.all([
    prisma.planConfig.findMany({ orderBy: { monthly: "asc" } }),
    prisma.schoolSubscription.groupBy({
      by: ["plan"],
      where: { school: { deletedAt: null } },
      _count: { _all: true },
    }),
  ])
  const counts = new Map(subscribers.map((row) => [row.plan, row._count._all]))

  const rows: PlanRow[] = configs.map((config) => ({
    id: config.id,
    plan: config.plan,
    label: config.label,
    monthly: Number(config.monthly),
    termly: Number(config.termly),
    annual: Number(config.annual),
    maxStudents: config.maxStudents,
    storageGb: config.storageGb,
    smsCredits: config.smsCredits,
    modules: config.modules,
    isPublic: config.isPublic,
    existingSubscribers: counts.get(config.plan) ?? 0,
  }))

  return (
    <PlansEditor
      initial={rows}
      notice="Catalogue pricing applies to new signups and to plan changes made from the console."
    />
  )
}
