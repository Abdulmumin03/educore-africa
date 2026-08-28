"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type HeatmapResponse = {
  from: string
  to: string
  keys?: string[]
  series?: Record<string, Array<{ date: string; pct: number | null; total: number }>>
  sections?: Record<string, Array<{ date: string; pct: number | null; total: number }>>
}

function color(pct: number | null) {
  if (pct === null) return "bg-muted"
  if (pct >= 90) return "bg-emerald-500"
  if (pct >= 75) return "bg-amber-500"
  return "bg-red-500"
}

export function AttendanceHeatmap({
  sections,
  classes,
}: {
  sections: { id: string; label: string }[]
  classes?: { id: string; label: string }[]
}) {
  const hasClasses = !!classes && classes.length > 0
  const [view, setView] = useState<"sections" | "classes">(hasClasses ? "classes" : "sections")

  const visible = view === "sections" ? sections.slice(0, 12) : (classes ?? []).slice(0, 12)
  const queryParam =
    view === "sections"
      ? `sectionIds=${visible.map((s) => s.id).join(",")}`
      : `classIds=${visible.map((c) => c.id).join(",")}`

  const { data, isLoading } = useQuery<HeatmapResponse>({
    queryKey: ["attendance-heatmap", view, queryParam],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/heatmap?${queryParam}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: visible.length > 0,
  })

  // `?? {}` allocates a new object on every render, which would re-run the
  // memo below each time and defeat the point of it.
  const series = useMemo(
    () => data?.series ?? data?.sections ?? {},
    [data],
  )
  const days = useMemo(() => {
    const first = visible[0]?.id
    return first ? series[first]?.map((d) => d.date) ?? [] : []
  }, [series, visible])

  return (
    <div className="space-y-3">
      {hasClasses && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">View:</span>
          <Button
            size="sm"
            variant={view === "classes" ? "default" : "outline"}
            onClick={() => setView("classes")}
          >
            By class
          </Button>
          <Button
            size="sm"
            variant={view === "sections" ? "default" : "outline"}
            onClick={() => setView("sections")}
          >
            By arm
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading heatmap…
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to show.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background pr-2 text-left text-[10px] uppercase text-muted-foreground">
                  {view === "sections" ? "Section" : "Class"}
                </th>
                {days.map((d, i) => {
                  const dj = dayjs(d)
                  const showMonth = i === 0 || dj.date() === 1
                  return (
                    <th
                      key={d}
                      title={dj.format("D MMM YYYY")}
                      className={cn(
                        "px-0.5 align-bottom text-[8px] text-muted-foreground",
                        dj.day() === 0 || dj.day() === 6 ? "opacity-60" : "",
                      )}
                    >
                      {showMonth ? dj.format("MMM") : dj.day() === 1 ? dj.format("D") : ""}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id}>
                  <td className="sticky left-0 z-10 bg-background py-1 pr-2 text-xs">
                    {s.label}
                  </td>
                  {series[s.id]?.map((d) => (
                    <td
                      key={d.date}
                      title={`${dayjs(d.date).format("ddd D MMM")} · ${d.pct === null ? "no data" : `${d.pct}%`} (${d.total})`}
                      className={cn("h-4 w-4 rounded-sm border border-background", color(d.pct))}
                      style={{ minWidth: 16 }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(view === "sections" ? sections : classes ?? []).length > 12 && (
        <p className="text-[10px] text-muted-foreground">
          Showing first 12 {view === "sections" ? "sections" : "classes"} — view full breakdown in reports.
        </p>
      )}

      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-emerald-500" /> ≥90%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-amber-500" /> 75–90%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-red-500" /> &lt;75%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-muted" /> no data
        </span>
      </div>
    </div>
  )
}
