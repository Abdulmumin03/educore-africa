"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent } from "@/components/ui/card"

const DONUT_COLOURS = ["#10b981", "#f59e0b", "#ef4444"]

export function ExecutiveCharts({
  enrollmentTrend,
  feeDonut,
  attendanceByClass: _attendanceByClass,
}: {
  enrollmentTrend: { months: string[]; thisYear: number[]; lastYear: number[] }
  feeDonut: { paid: number; partial: number; unpaid: number }
  attendanceByClass: {
    classId: string
    className: string
    presentPct: number | null
    total: number
  }[]
}) {
  // attendanceByClass is rendered as bars in the parent (mobile-friendly).
  // We keep the prop here so the parent can swap to a recharts BarChart if
  // it ever needs more density. For now ignore.
  void _attendanceByClass

  const lineData = enrollmentTrend.months.map((m, i) => ({
    month: m,
    thisYear: enrollmentTrend.thisYear[i] ?? 0,
    lastYear: enrollmentTrend.lastYear[i] ?? 0,
  }))
  const donutData = [
    { name: "Paid", value: feeDonut.paid },
    { name: "Partial", value: feeDonut.partial },
    { name: "Unpaid", value: feeDonut.unpaid },
  ]
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Monthly enrolment trend
            </p>
            <p className="text-[11px] text-muted-foreground">
              This year vs last year
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <LineChart data={lineData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip wrapperStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="lastYear"
                  name="Last year"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="thisYear"
                  name="This year"
                  stroke="#0D2B5E"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Fee collection
          </p>
          {donutTotal === 0 ? (
            <p className="text-xs text-muted-foreground">No invoices issued yet.</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLOURS[i]} />
                    ))}
                  </Pie>
                  <Tooltip wrapperStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Re-export a tiny non-recharts bar chart in case a future revision needs it.
export function MiniBarChart({
  data,
}: {
  data: { name: string; value: number }[]
}) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="value" fill="#0D2B5E" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
