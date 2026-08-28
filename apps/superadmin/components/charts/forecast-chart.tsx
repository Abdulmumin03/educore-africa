"use client"

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatCurrency } from "@/lib/utils"

export type ForecastBar = {
  month: string
  pessimistic: number
  base: number
  optimistic: number
}

const AXIS = { stroke: "#64748B", fontSize: 11 }

function compact(value: number): string {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `₦${Math.round(value / 1_000)}k`
  return `₦${Math.round(value)}`
}

export function ForecastChart({ data }: { data: ForecastBar[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="#1E3A5F" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} tickFormatter={compact} width={60} />
        <Tooltip
          cursor={{ fill: "rgba(139,92,246,0.06)" }}
          contentStyle={{ background: "#334155", border: "1px solid #3B6090", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#F8FAFC" }}
          formatter={(value) => formatCurrency(Number(value ?? 0))}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "#94A3B8" }} />
        <Bar dataKey="pessimistic" name="Pessimistic" fill="#64748B" radius={[3, 3, 0, 0]} maxBarSize={30} />
        <Bar dataKey="base" name="Base" fill="#8B5CF6" radius={[3, 3, 0, 0]} maxBarSize={30} />
        <Bar dataKey="optimistic" name="Optimistic" fill="#22C55E" radius={[3, 3, 0, 0]} maxBarSize={30} />
      </BarChart>
    </ResponsiveContainer>
  )
}
