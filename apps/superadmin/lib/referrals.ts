import { randomBytes } from "node:crypto"
import type { ReferralStatus } from "@prisma/client"

import { prisma } from "@/lib/db"

// Referral programme.
//
// Rewards are FREE MONTHS, awarded on the referred school converting to a
// paid plan — not on signup. A referral that signs up and churns during trial
// has cost EduCore an acquisition, not earned the referrer anything, and
// paying out at signup would make the programme trivially farmable.

export const REWARD_TIERS = [
  { conversions: 1, months: 1 },
  { conversions: 3, months: 3 },
  { conversions: 5, months: 6 },
] as const

/** Free months a school has earned for a given number of converted referrals. */
export function rewardFor(conversions: number): number {
  let months = 0
  for (const tier of REWARD_TIERS) {
    if (conversions >= tier.conversions) months = tier.months
  }
  return months
}

// No 0/O/1/I — a referral code gets read out over the phone.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function generateCode(schoolName: string): string {
  const stem = schoolName
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4)
    .padEnd(4, "X")
  const suffix = Array.from(randomBytes(4), (byte) => ALPHABET[byte % ALPHABET.length]).join("")
  return `${stem}-${suffix}`
}

export type ReferralRow = {
  id: string
  code: string
  referrerSchoolId: string
  referrer: string
  referredSchoolId: string | null
  referred: string | null
  status: ReferralStatus
  rewardMonths: number
  rewardedAt: string | null
  createdAt: string
}

export async function listReferrals(): Promise<{
  referrals: ReferralRow[]
  byReferrer: Array<{
    schoolId: string
    school: string
    codes: number
    signedUp: number
    converted: number
    /** What the tier table says they have earned in total. */
    earnedMonths: number
    /** What has actually been credited. */
    awardedMonths: number
  }>
}> {
  const rows = await prisma.referral.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      status: true,
      rewardMonths: true,
      rewardedAt: true,
      createdAt: true,
      referrerSchoolId: true,
      referredSchoolId: true,
      referrer: { select: { name: true } },
      referred: { select: { name: true } },
    },
  })

  const referrals: ReferralRow[] = rows.map((row) => ({
    id: row.id,
    code: row.code,
    referrerSchoolId: row.referrerSchoolId,
    referrer: row.referrer.name,
    referredSchoolId: row.referredSchoolId,
    referred: row.referred?.name ?? null,
    status: row.status,
    rewardMonths: row.rewardMonths,
    rewardedAt: row.rewardedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }))

  type ReferrerTotals = {
    schoolId: string
    school: string
    codes: number
    signedUp: number
    converted: number
    earnedMonths: number
    awardedMonths: number
  }
  const grouped = new Map<string, ReferrerTotals>()

  for (const referral of referrals) {
    const bucket = grouped.get(referral.referrerSchoolId) ?? {
      schoolId: referral.referrerSchoolId,
      school: referral.referrer,
      codes: 0,
      signedUp: 0,
      converted: 0,
      earnedMonths: 0,
      awardedMonths: 0,
    }
    bucket.codes += 1
    if (referral.status !== "PENDING") bucket.signedUp += 1
    if (referral.status === "CONVERTED" || referral.status === "REWARDED") bucket.converted += 1
    bucket.awardedMonths += referral.rewardMonths
    grouped.set(referral.referrerSchoolId, bucket)
  }

  const byReferrer = [...grouped.values()]
    .map((bucket) => ({ ...bucket, earnedMonths: rewardFor(bucket.converted) }))
    .sort((a, b) => b.converted - a.converted || b.signedUp - a.signedUp)

  return { referrals, byReferrer }
}

/** Create a code for a school. Retries once on the astronomically unlikely clash. */
export async function createReferralCode(input: {
  schoolId: string
  createdById: string
}): Promise<{ ok: true; code: string; id: string } | { ok: false; message: string }> {
  const school = await prisma.school.findFirst({
    where: { id: input.schoolId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!school) return { ok: false, message: "School not found." }

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode(school.name)
    try {
      const created = await prisma.referral.create({
        data: { referrerSchoolId: school.id, code, createdById: input.createdById },
        select: { id: true, code: true },
      })
      return { ok: true, code: created.code, id: created.id }
    } catch {
      // Unique clash on `code` — generate another.
    }
  }

  return { ok: false, message: "Could not generate a unique code. Try again." }
}

/**
 * Move a referral forward and settle the reward.
 *
 * The reward is recomputed from the referrer's CONVERTED count each time
 * rather than incremented, so a referral that is later un-converted cannot
 * leave a paid-out month behind.
 */
export async function advanceReferral(input: {
  id: string
  status: ReferralStatus
  referredSchoolId?: string | null
}): Promise<{ ok: true; rewardMonths: number } | { ok: false; message: string }> {
  const referral = await prisma.referral.findUnique({
    where: { id: input.id },
    select: { id: true, referrerSchoolId: true, status: true },
  })
  if (!referral) return { ok: false, message: "Referral not found." }

  if (input.referredSchoolId) {
    const exists = await prisma.school.findFirst({
      where: { id: input.referredSchoolId, deletedAt: null },
      select: { id: true },
    })
    if (!exists) return { ok: false, message: "The referred school does not exist." }
    if (exists.id === referral.referrerSchoolId) {
      return { ok: false, message: "A school cannot refer itself." }
    }
  }

  await prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: input.status,
      ...(input.referredSchoolId !== undefined ? { referredSchoolId: input.referredSchoolId } : {}),
    },
  })

  const converted = await prisma.referral.count({
    where: {
      referrerSchoolId: referral.referrerSchoolId,
      status: { in: ["CONVERTED", "REWARDED"] },
    },
  })
  const earned = rewardFor(converted)

  // Credit the whole entitlement to the most recent qualifying referral and
  // zero EVERY other referral this school holds — not just the qualifying
  // ones. Zeroing only the qualifying set would leave a reward credited to a
  // referral that has just been moved back out of CONVERTED, so the totals
  // would drift above the tier table with every reversal.
  const qualifying = await prisma.referral.findMany({
    where: {
      referrerSchoolId: referral.referrerSchoolId,
      status: { in: ["CONVERTED", "REWARDED"] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })

  await prisma.$transaction([
    prisma.referral.updateMany({
      where: { referrerSchoolId: referral.referrerSchoolId },
      data: { rewardMonths: 0, rewardedAt: null },
    }),
    ...(qualifying.length > 0
      ? [
          prisma.referral.update({
            where: { id: qualifying[qualifying.length - 1].id },
            data: { rewardMonths: earned, rewardedAt: earned > 0 ? new Date() : null },
          }),
        ]
      : []),
  ])

  return { ok: true, rewardMonths: earned }
}
