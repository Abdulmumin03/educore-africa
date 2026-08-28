"use client"

import { Bar, BarChart, Cell, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatNumber } from "@/lib/utils"

type UsageRow = { short: string; apiCalls: number }
type StorageSlice = { label: string; mb: number; colour: string }

const AXIS = { stroke: "#64748B", fontSize: 11 }

function Box({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-sa-border bg-sa-surface">
      <header className="border-b border-sa-border px-4 py-2.5">
        <h2 className="text-h3">{title}</h2>
        <p className="text-caption text-sa-dim">{subtitle}</p>
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function UsageCharts({ rows, storage }: { rows: UsageRow[]; storage: StorageSlice[] }) {
  const totalMb = storage.reduce((sum, slice) => sum + slice.mb, 0)

  return (
    <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
      <Box title="API calls by month" subtitle={`Last ${rows.length} months`}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="#1E3A5F" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="short" tickLine={false} axisLine={false} tick={AXIS} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={AXIS}
              tickFormatter={(value: number) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(value))}
            />
            <Tooltip
              cursor={{ fill: "rgba(59,130,246,0.06)" }}
              contentStyle={{
                background: "#334155",
                border: "1px solid #3B6090",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#F8FAFC" }}
              formatter={(value) => [formatNumber(Number(value ?? 0)), "API calls"]}
            />
            <Bar dataKey="apiCalls" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </Box>

      <Box title="Storage breakdown" subtitle={`${formatNumber(totalMb)} MB in the latest month`}>
        {totalMb === 0 ? (
          <p className="py-12 text-center text-body text-sa-dim">No storage metered.</p>
        ) : (
          <div className="flex items-center gap-5">
            <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={storage}
                    dataKey="mb"
                    nameKey="label"
                    innerRadius={50}
                    outerRadius={76}
                    paddingAngle={2}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {storage.map((slice) => (
                      <Cell key={slice.label} fill={slice.colour} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#334155",
                      border: "1px solid #3B6090",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value) => [`${formatNumber(Number(value ?? 0))} MB`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="tabular text-[20px] font-semibold leading-none">{formatNumber(totalMb)}</span>
                <span className="mt-1 text-caption text-sa-dim">MB</span>
              </div>
            </div>

            <ul className="min-w-0 flex-1 space-y-2">
              {storage.map((slice) => (
                <li key={slice.label} className="flex items-center gap-2 text-body">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: slice.colour }} aria-hidden="true" />
                  <span className="flex-1 truncate">{slice.label}</span>
                  <span className="tabular text-sa-muted">{formatNumber(slice.mb)} MB</span>
                </li>
              ))}
              <li className="pt-1 text-caption text-sa-dim">
                Split estimated from the single metered storage figure — not measured per category.
              </li>
            </ul>
          </div>
        )}
      </Box>
    </div>
  )
}
