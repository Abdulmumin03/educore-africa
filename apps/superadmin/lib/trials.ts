import { prisma } from "@/lib/db"
import { TOTAL_MODULES } from "@/lib/schools"

// Trial management.
//
// The conversion score is COMPUTED from observable trial behaviour, not
// guessed by a model. Claude is asked to write the reasoning around it (see
// /api/ai/trial-conversion-score), but the number itself is arithmetic over
// four signals so it is reproducible and can be argued with.

export type TrialSignals = {
  /** Distinct modules the school has written any row to. */
  modulesUsed: number
  /** Students on the roll. */
  students: number
  /** Staff accounts created beyond the founding admin. */
  teamSize: number
  /** Distinct days in the trial on which somebody signed in. */
  activeDays: number
  /** Days elapsed since signup. */
  trialAge: number
}

// Weights sum to 100. Ordered by how strongly each predicts a paid conversion
// in a school-management product: a school that has entered its roll and
// invited colleagues has committed real effort, which is worth more than
// clicking through modules.
const WEIGHTS = { students: 35, team: 25, modules: 25, engagement: 15 }

/**
 * 0–100 likelihood.
 *
 * Each signal is capped before weighting, so a school with 4,000 students
 * cannot score above one with 400 on that axis alone — past the threshold the
 * signal has told us what it can.
 */
export function conversionScore(signals: TrialSignals): number {
  const students = Math.min(1, signals.students / 150) * WEIGHTS.students
  const team = Math.min(1, signals.teamSize / 5) * WEIGHTS.team
  const modules = Math.min(1, signals.modulesUsed / 4) * WEIGHTS.modules

  // Engagement is days-active over days-elapsed, so a two-day-old trial with
  // two active days scores full marks rather than being punished for being new.
  const denominator = Math.max(1, Math.min(signals.trialAge, 30))
  const engagement = Math.min(1, signals.activeDays / denominator) * WEIGHTS.engagement

  return Math.round(students + team + modules + engagement)
}

export function scoreBand(score: number): "hot" | "warm" | "cool" | "cold" {
  if (score >= 70) return "hot"
  if (score >= 45) return "warm"
  if (score >= 20) return "cool"
  return "cold"
}

export type TrialRow = {
  schoolId: string
  school: string
  state: string | null
  plan: string
  startedAt: string
  trialEndsAt: string | null
  daysRemaining: number | null
  signals: TrialSignals
  score: number
  band: ReturnType<typeof scoreBand>
  lastLoginAt: string | null
}

export async function listTrials(): Promise<{ trials: TrialRow[]; totalModules: number }> {
  // One statement: per-module EXISTS plus the counts, because doing it in
  // Prisma would be a handful of queries per trial school.
  const rows = await prisma.$queryRaw<
    Array<{
      id: string
      name: string
      state: string | null
      plan: string
      started_at: Date
      trial_ends_at: Date | null
      students: bigint
      team: bigint
      active_days: bigint
      last_login: Date | null
      modules_used: bigint
    }>
  >`
    SELECT
      s."id",
      s."name",
      s."state",
      sub."plan"::text AS plan,
      sub."started_at",
      sub."trial_ends_at",
      (SELECT count(*) FROM "students" st WHERE st."school_id" = s."id" AND st."deleted_at" IS NULL)::bigint AS students,
      (SELECT count(*) FROM "users" u WHERE u."school_id" = s."id" AND u."deleted_at" IS NULL
         AND u."role" IN ('TEACHER','PRINCIPAL','BURSAR','COUNSELOR','LIBRARIAN','HOSTEL_MASTER','DRIVER'))::bigint AS team,
      (SELECT count(DISTINCT date_trunc('day', u."last_login_at")) FROM "users" u
         WHERE u."school_id" = s."id" AND u."last_login_at" IS NOT NULL)::bigint AS active_days,
      (SELECT max(u."last_login_at") FROM "users" u WHERE u."school_id" = s."id") AS last_login,
      (
        (CASE WHEN EXISTS (SELECT 1 FROM "attendance" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "grades" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "fee_invoices" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "announcements" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "assignments" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "libraries" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "bus_routes" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM "hostels" t WHERE t."school_id" = s."id") THEN 1 ELSE 0 END)
      )::bigint AS modules_used
    FROM "schools" s
    JOIN "school_subscriptions" sub ON sub."school_id" = s."id"
    WHERE s."deleted_at" IS NULL AND sub."status" = 'TRIAL'
    ORDER BY sub."trial_ends_at" ASC NULLS LAST
  `

  const now = Date.now()

  const trials = rows.map((row) => {
    const signals: TrialSignals = {
      modulesUsed: Number(row.modules_used),
      students: Number(row.students),
      teamSize: Number(row.team),
      activeDays: Number(row.active_days),
      trialAge: Math.max(1, Math.floor((now - row.started_at.getTime()) / 86_400_000)),
    }
    const score = conversionScore(signals)

    return {
      schoolId: row.id,
      school: row.name,
      state: row.state,
      plan: row.plan,
      startedAt: row.started_at.toISOString(),
      trialEndsAt: row.trial_ends_at?.toISOString() ?? null,
      daysRemaining: row.trial_ends_at
        ? Math.ceil((row.trial_ends_at.getTime() - now) / 86_400_000)
        : null,
      signals,
      score,
      band: scoreBand(score),
      lastLoginAt: row.last_login?.toISOString() ?? null,
    }
  })

  return { trials, totalModules: TOTAL_MODULES }
}

export async function trialFor(schoolId: string): Promise<TrialRow | null> {
  const { trials } = await listTrials()
  return trials.find((trial) => trial.schoolId === schoolId) ?? null
}
