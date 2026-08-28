import { prisma } from "@/lib/db"
import { REWARD_TIERS, listReferrals } from "@/lib/referrals"
import { ReferralsPanel, type ReferralRow, type ReferrerTotals } from "../referrals-panel"

export async function ReferralsTab() {
  const [{ referrals, byReferrer }, schools] = await Promise.all([
    listReferrals(),
    prisma.school.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <ReferralsPanel
      referrals={referrals as ReferralRow[]}
      byReferrer={byReferrer as ReferrerTotals[]}
      tiers={REWARD_TIERS}
      schools={schools}
    />
  )
}
