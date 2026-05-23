"use client"

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import {
  ANALYTICS_COLOURS,
  EmptyBlock,
  LoadingBlock,
  SectionCard,
  useAnalytics,
} from "../primitives"

type Data = {
  byGender: { name: string; value: number }[]
  byClassLevel: { name: string; value: number }[]
  newVsReturning: { name: string; value: number }[]
  total: number
}

export function EnrollmentTab({ from, to }: { from: string; to: string }) {
  const q = useAnalytics<Data>("enrollment", from, to)
  if (q.isLoading) return <LoadingBlock />
  const data = q.data
  if (!data || data.total === 0) {
    return <EmptyBlock message="No enrolments in this range yet." />
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Pie3
        title={`Gender (${data.total.toLocaleString()} students)`}
        data={data.byGender}
      />
      <Pie3 title="Class level" data={data.byClassLevel} />
      <Pie3 title="New vs returning" data={data.newVsReturning} />

      <div className="lg:col-span-3">
        <SectionCard
          title="AI enrolment forecast"
          hint="Defers to historical baseline"
        >
          <p className="text-sm text-muted-foreground">
            Forecast deferred — requires multi-year historical baseline. Will surface here once a school has 3+ academic years of data.
          </p>
        </SectionCard>
      </div>
    </div>
  )
}

function Pie3({
  title,
  data,
}: {
  title: string
  data: { name: string; value: number }[]
}) {
  return (
    <SectionCard title={title}>
      {data.length === 0 || data.every((d) => d.value === 0) ? (
        <p className="text-xs text-muted-foreground">No data.</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                outerRadius={80}
                label
                fontSize={11}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={ANALYTICS_COLOURS[i % ANALYTICS_COLOURS.length]} />
                ))}
              </Pie>
              <Tooltip wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  )
}
