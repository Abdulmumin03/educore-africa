"use client"

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

export type ChurnPoint = { label: string; churned: number; rate: number; active: number }

const AXIS = { stroke: "#64748B", fontSize: 11 }

function ChurnTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ payload?: ChurnPoint }>
  label?: string | number
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  return (
    <div className="rounded-lg border border-sa-border-em bg-sa-overlay px-3 py-2 shadow-xl">
      <p className="mb-1 text-body font-semibold">{label}</p>
      <p className="flex justify-between gap-6 text-caption text-sa-muted">
        Churned <span className="tabular text-sa-text">{point.churned}</span>
      </p>
      <p className="flex justify-between gap-6 text-caption text-sa-muted">
        Rate <span className="tabular text-sa-text">{point.rate.toFixed(2)}%</span>
      </p>
      <p className="flex justify-between gap-6 text-caption text-sa-muted">
        Active at start <span className="tabular text-sa-text">{point.active}</span>
      </p>
    </div>
  )
}

/**
 * Count and rate genuinely are different units, so this is the one place a
 * second axis is warranted — and the right axis is explicitly labelled "%".
 */
export function ChurnChart({ data }: { data: ChurnPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid stroke="#1E3A5F" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis yAxisId="count" tickLine={false} axisLine={false} tick={AXIS} allowDecimals={false} />
        <YAxis
          yAxisId="rate"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tick={AXIS}
          width={44}
          tickFormatter={(value: number) => `${value.toFixed(1)}%`}
        />
        <Tooltip content={<ChurnTooltip />} cursor={{ fill: "rgba(239,68,68,0.06)" }} />
        <Bar yAxisId="count" dataKey="churned" fill="#EF4444" fillOpacity={0.8} radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Line
          yAxisId="rate"
          dataKey="rate"
          type="monotone"
          stroke="#F59E0B"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#F59E0B", stroke: "#1E293B", strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
