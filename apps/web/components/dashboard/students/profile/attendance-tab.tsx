"use client"

import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type AttendanceResponse = {
  summary: { PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number; totalDays: number; percent: number }
  items: Array<{ id: string; date: string; status: string; remark: string | null }>
}

export function AttendanceTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery<AttendanceResponse>({
    queryKey: ["student-attendance", studentId],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/attendance`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading attendance…
      </div>
    )
  }

  if (!data || data.summary.totalDays === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-12 text-center">
        <p className="text-sm font-medium">No attendance recorded yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Daily attendance shows up here once teachers start marking.
        </p>
      </div>
    )
  }

  const pct = data.summary.percent
  const absentDays = data.items.filter((i) => i.status === "ABSENT" || i.status === "LATE")

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">This term</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Gauge percent={pct} />
          <div className="grid w-full grid-cols-2 gap-2 text-center text-xs">
            <Stat label="Present" value={data.summary.PRESENT} accent="text-emerald-600" />
            <Stat label="Absent" value={data.summary.ABSENT} accent="text-red-600" />
            <Stat label="Late" value={data.summary.LATE} accent="text-amber-600" />
            <Stat label="Excused" value={data.summary.EXCUSED} accent="text-slate-500" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last 60 days</CardTitle>
          </CardHeader>
          <CardContent>
            <Heatmap items={data.items.slice(0, 60)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Absent &amp; late days</CardTitle>
          </CardHeader>
          <CardContent>
            {absentDays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No absences. </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {absentDays.slice(0, 12).map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2"
                  >
                    <span>
                      <span className="font-medium">{dayjs(i.date).format("ddd D MMM")}</span>
                      {i.remark ? <span className="ml-2 text-xs text-muted-foreground">— {i.remark}</span> : null}
                    </span>
                    <Badge variant={i.status === "ABSENT" ? "destructive" : "secondary"}>
                      {i.status[0] + i.status.slice(1).toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Gauge({ percent }: { percent: number }) {
  const size = 140
  const stroke = 12
  const radius = (size - stroke) / 2
  const c = 2 * Math.PI * radius
  const offset = c - (percent / 100) * c
  const color =
    percent >= 90 ? "stroke-emerald-500" : percent >= 75 ? "stroke-amber-500" : "stroke-red-500"

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        className="stroke-muted fill-none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={cn("fill-none transition-all duration-500", color)}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 fill-foreground text-2xl font-bold"
        style={{ transformOrigin: "50% 50%", transform: "rotate(90deg)" }}
      >
        {percent}%
      </text>
    </svg>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-base font-bold tabular-nums", accent)}>{value}</div>
    </div>
  )
}

const COLOR: Record<string, string> = {
  PRESENT: "bg-emerald-500",
  ABSENT: "bg-red-500",
  LATE: "bg-amber-500",
  EXCUSED: "bg-slate-400",
}

function Heatmap({ items }: { items: AttendanceResponse["items"] }) {
  return (
    <div className="grid grid-cols-12 gap-1 sm:grid-cols-15 md:grid-cols-20">
      {items.map((i) => (
        <div
          key={i.id}
          title={`${i.date} · ${i.status}${i.remark ? " · " + i.remark : ""}`}
          className={cn("h-4 w-4 rounded-sm", COLOR[i.status] ?? "bg-muted")}
        />
      ))}
    </div>
  )
}
