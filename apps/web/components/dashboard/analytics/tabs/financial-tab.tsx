"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
  revenueByMonth: { month: string; total: number }[]
  collectionByClass: {
    classId: string
    name: string
    billed: number
    paid: number
    ratePct: number
  }[]
  feeComponents: { name: string; value: number }[]
}

const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
})

export function FinancialTab({ from, to }: { from: string; to: string }) {
  const q = useAnalytics<Data>("financial", from, to)
  if (q.isLoading) return <LoadingBlock />
  const data = q.data
  if (
    !data ||
    (data.revenueByMonth.length === 0 &&
      data.collectionByClass.length === 0 &&
      data.feeComponents.length === 0)
  ) {
    return <EmptyBlock message="No invoices or payments in this range yet." />
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <SectionCard title="Revenue by month" className="lg:col-span-2">
        {data.revenueByMonth.length === 0 ? (
          <p className="text-xs text-muted-foreground">No payments yet.</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <BarChart
                data={data.revenueByMonth}
                margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => (typeof v === "number" ? money.format(v) : String(v))}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="total" fill={ANALYTICS_COLOURS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Collection rate by class">
        {data.collectionByClass.length === 0 ? (
          <p className="text-xs text-muted-foreground">No invoices yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.collectionByClass.map((c) => (
              <li key={c.classId} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">
                    {c.ratePct}% · {money.format(c.paid)} of {money.format(c.billed)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-muted">
                  <div
                    className={
                      c.ratePct >= 80
                        ? "h-full bg-emerald-500"
                        : c.ratePct >= 50
                          ? "h-full bg-amber-500"
                          : "h-full bg-red-500"
                    }
                    style={{ width: `${Math.min(100, c.ratePct)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Fee component breakdown">
        {data.feeComponents.length === 0 ? (
          <p className="text-xs text-muted-foreground">No invoice items in this range.</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data.feeComponents}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  label
                  fontSize={11}
                >
                  {data.feeComponents.map((_, i) => (
                    <Cell key={i} fill={ANALYTICS_COLOURS[i % ANALYTICS_COLOURS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => (typeof v === "number" ? money.format(v) : String(v))}
                  wrapperStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
