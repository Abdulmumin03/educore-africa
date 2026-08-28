import type { LeadStage } from "@prisma/client"

import { prisma } from "@/lib/db"

// Sales pipeline.
//
// Leads are NOT schools. A lead is somebody who might become a tenant; a
// school is a tenant. Keeping them in separate tables means the platform's
// school count never inflates with prospects, and a lost lead leaves no
// orphaned tenant behind.

export const LEAD_STAGES: Array<{ key: LeadStage; label: string; tone: string }> = [
  { key: "NEW", label: "New lead", tone: "text-sa-blue" },
  { key: "CONTACTED", label: "Contacted", tone: "text-sa-purple" },
  { key: "DEMO_SCHEDULED", label: "Demo scheduled", tone: "text-sa-amber" },
  { key: "TRIAL_STARTED", label: "Trial started", tone: "text-sa-teal" },
  { key: "CONVERTED", label: "Converted", tone: "text-sa-green" },
  { key: "LOST", label: "Lost", tone: "text-sa-dim" },
]

/** New cards land at the top of their column. */
const POSITION_STEP = 1000

export type LeadCard = {
  id: string
  schoolName: string
  contactName: string
  contactEmail: string | null
  contactPhone: string | null
  state: string | null
  sizeEstimate: number | null
  source: string | null
  notes: string | null
  stage: LeadStage
  position: number
  owner: string | null
  ownerId: string | null
  convertedSchoolId: string | null
  lostReason: string | null
  /** How long the card has sat in its current column. */
  daysInStage: number
  createdAt: string
}

export async function listLeads(): Promise<{
  columns: Array<{ stage: LeadStage; label: string; tone: string; cards: LeadCard[] }>
  total: number
}> {
  const [rows, owners] = await Promise.all([
    prisma.lead.findMany({ orderBy: [{ stage: "asc" }, { position: "asc" }] }),
    prisma.superAdminUser.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ])
  const ownerNames = new Map(owners.map((owner) => [owner.id, owner.name]))
  const now = Date.now()

  const cards: LeadCard[] = rows.map((row) => ({
    id: row.id,
    schoolName: row.schoolName,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    state: row.state,
    sizeEstimate: row.sizeEstimate,
    source: row.source,
    notes: row.notes,
    stage: row.stage,
    position: row.position,
    ownerId: row.ownerId,
    owner: row.ownerId ? (ownerNames.get(row.ownerId) ?? "Unknown") : null,
    convertedSchoolId: row.convertedSchoolId,
    lostReason: row.lostReason,
    daysInStage: Math.floor((now - row.stageChangedAt.getTime()) / 86_400_000),
    createdAt: row.createdAt.toISOString(),
  }))

  return {
    columns: LEAD_STAGES.map((stage) => ({
      stage: stage.key,
      label: stage.label,
      tone: stage.tone,
      cards: cards.filter((card) => card.stage === stage.key),
    })),
    total: cards.length,
  }
}

/**
 * Where to drop a card.
 *
 * Midpoint insertion: a move rewrites ONE row, not the whole column. Two
 * cards can in principle converge on the same float after many moves, which
 * the tie-break on id keeps deterministic rather than jittery.
 */
export async function positionFor(
  stage: LeadStage,
  beforeId: string | null,
  afterId: string | null,
): Promise<number> {
  const [before, after] = await Promise.all([
    beforeId
      ? prisma.lead.findUnique({ where: { id: beforeId }, select: { position: true } })
      : null,
    afterId ? prisma.lead.findUnique({ where: { id: afterId }, select: { position: true } }) : null,
  ])

  if (before && after) return (before.position + after.position) / 2
  if (before) return before.position + POSITION_STEP
  if (after) return after.position - POSITION_STEP

  // Empty column, or dropped without neighbours: put it at the top.
  const top = await prisma.lead.findFirst({
    where: { stage },
    orderBy: { position: "asc" },
    select: { position: true },
  })
  return top ? top.position - POSITION_STEP : POSITION_STEP
}

/** Conversion counts by stage, for the pipeline summary. */
export async function pipelineSummary() {
  const [counts, converted] = await Promise.all([
    prisma.lead.groupBy({ by: ["stage"], _count: { _all: true } }),
    prisma.lead.count({ where: { stage: "CONVERTED" } }),
  ])

  const byStage = new Map(counts.map((row) => [row.stage, row._count._all]))
  const total = counts.reduce((sum, row) => sum + row._count._all, 0)
  const settled = (byStage.get("CONVERTED") ?? 0) + (byStage.get("LOST") ?? 0)

  return {
    total,
    byStage: Object.fromEntries(LEAD_STAGES.map((stage) => [stage.key, byStage.get(stage.key) ?? 0])),
    // Rate over SETTLED leads, not all leads: counting a lead that arrived
    // yesterday as a failure to convert would make the number meaningless.
    winRate: settled > 0 ? (converted / settled) * 100 : null,
    settled,
  }
}
