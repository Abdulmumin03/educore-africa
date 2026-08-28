"use client"

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export type GrowthPoint = {
  month: string
  label: string
  signups: number
  churned: number
  net: number
}

const AXIS = { stroke: "#64748B", fontSize: 11 }

function GrowthTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number | string }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  const signups = Number(payload.find((p) => p.dataKey === "signups")?.value ?? 0)
  const churned = Number(payload.find((p) => p.dataKey === "churned")?.value ?? 0)

  return (
    <div className="rounded-lg border border-sa-border-em bg-sa-overlay px-3 py-2 shadow-xl">
      <p className="mb-1 text-body font-semibold">{label}</p>
      <p className="flex items-center justify-between gap-6 text-caption text-sa-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-sa-blue" />
          New signups
        </span>
        <span className="tabular text-sa-text">{signups}</span>
      </p>
      <p className="flex items-center justify-between gap-6 text-caption text-sa-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-sm bg-sa-red" />
          Churned
        </span>
        <span className="tabular text-sa-text">{churned}</span>
      </p>
      <p className="mt-1 flex items-center justify-between gap-6 border-t border-sa-border-em pt-1 text-caption">
        <span className="text-sa-muted">Net</span>
        <span className={`tabular ${signups - churned >= 0 ? "text-sa-green" : "text-sa-red"}`}>
          {signups - churned >= 0 ? "+" : ""}
          {signups - churned}
        </span>
      </p>
    </div>
  )
}

/**
 * Signups and churn share ONE y-axis — both are "schools per month", so a
 * second scale would let the two series be positioned arbitrarily against
 * each other and make the gap between them meaningless.
 */
export function GrowthChart({ data }: { data: GrowthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="#1E3A5F" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} allowDecimals={false} />
        <Tooltip content={<GrowthTooltip />} cursor={{ fill: "rgba(59,130,246,0.06)" }} />
        <Bar dataKey="signups" name="New signups" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={34} />
        <Line
          dataKey="churned"
          name="Churned"
          type="monotone"
          stroke="#EF4444"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          activeDot={{ r: 4, fill: "#EF4444", stroke: "#1E293B", strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
