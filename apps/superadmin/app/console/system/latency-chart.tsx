"use client"

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type Bucket = {
  hour: string
  label: string
  calls: number
  p50: number | null
  p95: number | null
  p99: number | null
}

// One hue per percentile, ordered light to dark: they measure the same thing
// at different severities, so a categorical palette would imply they are
// unrelated series.
const SERIES = [
  { key: "p50", label: "P50", colour: "#60A5FA" },
  { key: "p95", label: "P95", colour: "#3B82F6" },
  { key: "p99", label: "P99", colour: "#1D4ED8" },
] as const

export function LatencyChart({ buckets }: { buckets: Bucket[] }) {
  const hasData = buckets.some((bucket) => bucket.calls > 0)

  if (!hasData) {
    return (
      <p className="py-10 text-center text-body text-sa-dim">
        No requests sampled in the last 24 hours.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#293548" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#64748B", fontSize: 10 }}
          interval={3}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#64748B", fontSize: 10 }}
          width={48}
          unit="ms"
        />
        <Tooltip
          contentStyle={{
            background: "#293548",
            border: "1px solid #334155",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "#F1F5F9" }}
          formatter={(value, name) => [value === null ? "no traffic" : `${Number(value)}ms`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "#94A3B8" }} />
        {SERIES.map((series) => (
          <Line
            key={series.key}
            type="monotone"
            dataKey={series.key}
            name={series.label}
            stroke={series.colour}
            strokeWidth={2}
            // Dots, not a bare line: traffic here is bursty, and an hour whose
            // neighbours are both empty draws no line segment at all — without
            // a dot that sample would be invisible rather than sparse.
            dot={{ r: 2.5, fill: series.colour, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            // An hour with no traffic is a gap, not a zero.
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
