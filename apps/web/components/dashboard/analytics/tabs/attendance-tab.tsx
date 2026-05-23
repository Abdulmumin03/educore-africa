"use client"

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ANALYTICS_COLOURS,
  EmptyBlock,
  LoadingBlock,
  SectionCard,
  useAnalytics,
} from "../primitives"

type Data = {
  trend: { month: string; presentPct: number; total: number }[]
  classRanking: { classId: string; name: string; presentPct: number; total: number }[]
  topAbsent: { id: string; admissionNumber: string; name: string; absences: number }[]
}

export function AttendanceTab({ from, to }: { from: string; to: string }) {
  const q = useAnalytics<Data>("attendance", from, to)
  if (q.isLoading) return <LoadingBlock />
  const data = q.data
  if (!data || data.trend.length === 0) {
    return <EmptyBlock message="No attendance recorded in this range yet." />
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <SectionCard title="School attendance trend" className="lg:col-span-2">
        <div className="h-64 w-full">
          <ResponsiveContainer>
            <LineChart data={data.trend} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="presentPct"
                stroke={ANALYTICS_COLOURS[0]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Class ranking">
        {data.classRanking.length === 0 ? (
          <p className="text-xs text-muted-foreground">No class data yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {data.classRanking.map((c, i) => (
              <li key={c.classId} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{i + 1}.</span>
                  {c.name}
                </span>
                <span className="font-semibold">{c.presentPct}%</span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      <SectionCard title="Top 20 most absent">
        {data.topAbsent.length === 0 ? (
          <p className="text-xs text-muted-foreground">No absences recorded yet.</p>
        ) : (
          <ol className="space-y-1.5 text-sm">
            {data.topAbsent.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-xs text-muted-foreground">{i + 1}.</span> {s.name}
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    · {s.admissionNumber}
                  </span>
                </span>
                <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-900">
                  {s.absences} days
                </span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  )
}
