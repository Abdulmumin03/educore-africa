"use client"

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { PLAN_COLOUR, PLAN_LABEL, PLAN_ORDER } from "@/lib/plans"
import { formatCurrency } from "@/lib/utils"

export type AreaPoint = { period: string; label: string; total: number } & Record<string, number | string>

const AXIS = { stroke: "#64748B", fontSize: 11 }

function compact(value: number): string {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `₦${Math.round(value / 1_000)}k`
  return `₦${Math.round(value)}`
}

function AreaTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey?: string | number; value?: number | string }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0)

  return (
    <div className="rounded-lg border border-sa-border-em bg-sa-overlay px-3 py-2 shadow-xl">
      <p className="mb-1.5 text-body font-semibold">{label}</p>
      {[...payload].reverse().map((entry) => {
        const plan = String(entry.dataKey) as keyof typeof PLAN_LABEL
        if (!PLAN_LABEL[plan]) return null
        return (
          <p key={plan} className="flex items-center justify-between gap-6 text-caption text-sa-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: PLAN_COLOUR[plan] }} />
              {PLAN_LABEL[plan]}
            </span>
            <span className="tabular text-sa-text">{formatCurrency(Number(entry.value ?? 0))}</span>
          </p>
        )
      })}
      <p className="mt-1 flex items-center justify-between gap-6 border-t border-sa-border-em pt-1 text-caption">
        <span className="font-semibold text-sa-text">Total</span>
        <span className="tabular font-semibold text-sa-text">{formatCurrency(total)}</span>
      </p>
    </div>
  )
}

export function RevenueAreaChart({ data }: { data: AreaPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="#1E3A5F" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} tickFormatter={compact} width={60} />
        <Tooltip content={<AreaTooltip />} />
        {PLAN_ORDER.map((plan) => (
          <Area
            key={plan}
            type="monotone"
            dataKey={plan}
            stackId="mrr"
            stroke={PLAN_COLOUR[plan]}
            strokeWidth={1.5}
            fill={PLAN_COLOUR[plan]}
            fillOpacity={0.75}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
