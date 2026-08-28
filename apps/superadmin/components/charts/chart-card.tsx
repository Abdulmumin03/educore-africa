"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export type ChartPoint = Record<string, string | number>

type Series = { key: string; label: string; color?: string }

// Recharts wrapper so every console chart shares one look. Colours come from
// the --chart-N tokens rather than hard-coded hex, so they follow the theme.
const PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

export function ChartCard({
  title,
  description,
  data,
  xKey,
  series,
  kind = "line",
  height = 260,
}: {
  title: string
  description?: string
  data: ChartPoint[]
  xKey: string
  series: Series[]
  kind?: "line" | "bar" | "area"
  height?: number
}) {
  const colorFor = (item: Series, index: number) => item.color ?? PALETTE[index % PALETTE.length]

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
      <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={12} />
      <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
      <Tooltip
        contentStyle={{
          background: "hsl(var(--popover))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "var(--radius)",
          fontSize: 12,
        }}
      />
    </>
  )

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          {kind === "bar" ? (
            <BarChart data={data}>
              {axes}
              {series.map((item, index) => (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  name={item.label}
                  fill={colorFor(item, index)}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          ) : kind === "area" ? (
            <AreaChart data={data}>
              {axes}
              {series.map((item, index) => (
                <Area
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.label}
                  stroke={colorFor(item, index)}
                  fill={colorFor(item, index)}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={data}>
              {axes}
              {series.map((item, index) => (
                <Line
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.label}
                  stroke={colorFor(item, index)}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
