"use client"

import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Clock, LogIn, LogOut, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Response = {
  summary: {
    PRESENT: number
    LATE: number
    ABSENT: number
    REMOTE: number
    HOLIDAY: number
    totalDays: number
    percent: number | null
  }
  items: Array<{
    id: string
    date: string
    status: string
    checkInAt: string | null
    checkOutAt: string | null
    remark: string | null
  }>
}

export function AttendanceTab({ staffId, isSelf }: { staffId: string; isSelf: boolean }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<Response>({
    queryKey: ["staff-attendance", staffId],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${staffId}/attendance`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  // Today's row, if any — used to decide whether to show Clock In or Clock Out.
  const today = useMemo(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t.toISOString().slice(0, 10)
  }, [])
  const todayRow = data?.items.find((i) => i.date.slice(0, 10) === today)

  const clock = useMutation({
    mutationFn: async (action: "CHECK_IN" | "CHECK_OUT") => {
      const res = await fetch(`/api/staff/${staffId}/attendance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ at: string; action: string; status: string }>
    },
    onSuccess: (d) => {
      toast.success(
        `${d.action === "CHECK_IN" ? "Clocked in" : "Clocked out"} at ${dayjs(d.at).format("HH:mm")}${
          d.action === "CHECK_IN" && d.status === "LATE" ? " (marked late)" : ""
        }`,
      )
      qc.invalidateQueries({ queryKey: ["staff-attendance", staffId] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  const pct = data.summary.percent ?? 0
  return (
    <div className="space-y-4">
      {isSelf && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              <Clock className="mr-1.5 inline h-4 w-4" />
              Today
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {todayRow ? (
                <>
                  <div>
                    Checked in at{" "}
                    <span className="font-mono font-medium">
                      {todayRow.checkInAt ? dayjs(todayRow.checkInAt).format("HH:mm") : "—"}
                    </span>
                    {todayRow.status === "LATE" && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">Late</Badge>
                    )}
                  </div>
                  {todayRow.checkOutAt && (
                    <div className="text-xs text-muted-foreground">
                      Checked out at {dayjs(todayRow.checkOutAt).format("HH:mm")}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Not clocked in yet today.</span>
              )}
            </div>
            <div className="flex gap-2">
              {!todayRow?.checkInAt && (
                <Button
                  size="sm"
                  onClick={() => clock.mutate("CHECK_IN")}
                  disabled={clock.isPending}
                >
                  {clock.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <LogIn className="mr-1.5 h-4 w-4" />}
                  Clock in
                </Button>
              )}
              {todayRow?.checkInAt && !todayRow.checkOutAt && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => clock.mutate("CHECK_OUT")}
                  disabled={clock.isPending}
                >
                  {clock.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <LogOut className="mr-1.5 h-4 w-4" />}
                  Clock out
                </Button>
              )}
              {todayRow?.checkInAt && todayRow.checkOutAt && (
                <Badge variant="outline">Day complete</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">This term</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Gauge percent={data.summary.percent === null ? 0 : pct} unknown={data.summary.percent === null} />
          <div className="grid w-full grid-cols-2 gap-2 text-center text-xs">
            <Stat label="Present" value={data.summary.PRESENT} accent="text-emerald-600" />
            <Stat label="Late" value={data.summary.LATE} accent="text-amber-600" />
            <Stat label="Absent" value={data.summary.ABSENT} accent="text-red-600" />
            <Stat label="Remote" value={data.summary.REMOTE} accent="text-slate-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Check-in / out log</CardTitle>
        </CardHeader>
        <CardContent>
          {data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No attendance records yet — once daily check-in is set up, entries appear here.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data.items.slice(0, 30).map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2"
                >
                  <div>
                    <span className="font-medium">{dayjs(i.date).format("ddd D MMM")}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {i.checkInAt && `in ${dayjs(i.checkInAt).format("HH:mm")}`}
                      {i.checkOutAt && ` · out ${dayjs(i.checkOutAt).format("HH:mm")}`}
                    </span>
                    {i.remark && (
                      <span className="ml-2 text-xs text-muted-foreground">— {i.remark}</span>
                    )}
                  </div>
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

function Gauge({ percent, unknown }: { percent: number; unknown: boolean }) {
  const size = 140
  const stroke = 12
  const radius = (size - stroke) / 2
  const c = 2 * Math.PI * radius
  const offset = c - (percent / 100) * c
  const color =
    unknown
      ? "stroke-muted-foreground/30"
      : percent >= 90
        ? "stroke-emerald-500"
        : percent >= 75
          ? "stroke-amber-500"
          : "stroke-red-500"

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="stroke-muted fill-none" />
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
        {unknown ? "—" : `${percent}%`}
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
