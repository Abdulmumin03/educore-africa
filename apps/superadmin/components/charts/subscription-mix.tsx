"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { PLAN_COLOUR, PLAN_LABEL, type PlanKey } from "@/lib/plans"
import { formatNumber } from "@/lib/utils"

export type MixSlice = {
  plan: PlanKey
  schools: number
  mrr: number
  share: number
  schoolShare: number
}

function MixTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: MixSlice }>
}) {
  const slice = payload?.[0]?.payload
  if (!active || !slice) return null

  return (
    <div className="rounded-lg border border-sa-border-em bg-sa-overlay px-3 py-2 shadow-xl">
      <p className="mb-1 flex items-center gap-2 text-body font-semibold">
        <span
          className="h-2 w-2 rounded-sm"
          style={{ background: PLAN_COLOUR[slice.plan] }}
          aria-hidden="true"
        />
        {PLAN_LABEL[slice.plan]}
      </p>
      <p className="flex justify-between gap-6 text-caption text-sa-muted">
        Schools <span className="tabular text-sa-text">{formatNumber(slice.schools)}</span>
      </p>
      <p className="flex justify-between gap-6 text-caption text-sa-muted">
        Share <span className="tabular text-sa-text">{slice.schoolShare.toFixed(1)}%</span>
      </p>
    </div>
  )
}

export function SubscriptionMix({
  slices,
  totalSchools,
}: {
  slices: MixSlice[]
  totalSchools: number
}) {
  const populated = slices.filter((slice) => slice.schools > 0)

  if (populated.length === 0) {
    return (
      <p className="flex h-[200px] items-center justify-center text-body text-sa-dim">
        No subscriptions recorded yet.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 190, height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={populated}
              dataKey="schools"
              nameKey="plan"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {populated.map((slice) => (
                <Cell key={slice.plan} fill={PLAN_COLOUR[slice.plan]} />
              ))}
            </Pie>
            <Tooltip content={<MixTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-[24px] font-semibold leading-none">
            {formatNumber(totalSchools)}
          </span>
          <span className="mt-1 text-caption text-sa-dim">schools</span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {slices.map((slice) => (
          <li key={slice.plan} className="flex items-center gap-2 text-body">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ background: PLAN_COLOUR[slice.plan] }}
              aria-hidden="true"
            />
            <span className="flex-1 truncate">{PLAN_LABEL[slice.plan]}</span>
            <span className="tabular text-sa-muted">{formatNumber(slice.schools)}</span>
            <span className="tabular w-12 text-right text-caption text-sa-dim">
              {slice.schoolShare.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
