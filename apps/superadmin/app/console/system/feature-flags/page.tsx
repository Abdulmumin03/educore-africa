import type { Metadata } from "next"

import { PageHeader } from "@/components/shared/page-header"
import { prisma } from "@/lib/db"
import { allFlags, flagReach } from "@/lib/flags"
import { requireRole } from "@/lib/session"
import { SystemNav } from "../system-nav"
import { FlagsManager, type FlagRow } from "./flags-manager"

export const metadata: Metadata = { title: "Feature Flags" }
export const dynamic = "force-dynamic"

export default async function FeatureFlagsPage() {
  await requireRole("ENGINEERING_ADMIN", "BUSINESS_ADMIN")

  const flags = await allFlags()
  const meta = await prisma.featureFlag.findMany({ select: { id: true, key: true, updatedAt: true } })
  const byKey = new Map(meta.map((row) => [row.key, row]))

  const rows: FlagRow[] = await Promise.all(
    flags.map(async (flag) => ({
      ...flag,
      id: byKey.get(flag.key)?.id ?? flag.key,
      updatedAt: byKey.get(flag.key)?.updatedAt.toISOString() ?? null,
      reach: await flagReach(flag),
    })),
  )

  const live = rows.filter((row) => row.enabled).length

  return (
    <>
      <PageHeader
        title="Feature flags"
        description={`${live} of ${rows.length} enabled. A toggle takes effect on the next evaluation — the read cache is cleared by the write, not by a timer.`}
      />

      <SystemNav />

      <FlagsManager initial={rows} />
    </>
  )
}
