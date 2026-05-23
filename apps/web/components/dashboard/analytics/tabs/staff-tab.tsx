"use client"

import { Badge } from "@/components/ui/badge"
import {
  EmptyBlock,
  LoadingBlock,
  SectionCard,
  useAnalytics,
} from "../primitives"

type Data = {
  attendancePct: { staffId: string; name: string; ratePct: number; days: number }[]
  workload: { staffId: string; name: string; periodsPerWeek: number }[]
  performance: { staffId: string; name: string; score: number; badge: string | null }[]
}

export function StaffTab({ from, to }: { from: string; to: string }) {
  const q = useAnalytics<Data>("staff", from, to)
  if (q.isLoading) return <LoadingBlock />
  const data = q.data
  if (
    !data ||
    (data.attendancePct.length === 0 &&
      data.workload.length === 0 &&
      data.performance.length === 0)
  ) {
    return <EmptyBlock message="No staff data in this range yet." />
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <SectionCard title="Teacher attendance %">
        {data.attendancePct.length === 0 ? (
          <p className="text-xs text-muted-foreground">No staff attendance recorded.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.attendancePct.map((s) => (
              <li key={s.staffId} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground">
                    {s.ratePct}% · {s.days} days
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-muted">
                  <div
                    className={
                      s.ratePct >= 90
                        ? "h-full bg-emerald-500"
                        : s.ratePct >= 75
                          ? "h-full bg-amber-500"
                          : "h-full bg-red-500"
                    }
                    style={{ width: `${s.ratePct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Workload" hint="Timetable periods per week">
        {data.workload.length === 0 ? (
          <p className="text-xs text-muted-foreground">No timetable slots assigned.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.workload.map((s) => (
              <li key={s.staffId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {s.periodsPerWeek} periods
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Performance leaderboard"
        className="lg:col-span-2"
        hint="Final evaluation scores"
      >
        {data.performance.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No finalised evaluations in this range.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {data.performance.map((s, i) => (
              <li
                key={s.staffId}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{i + 1}.</span>
                  {s.name}
                  {s.badge && (
                    <Badge variant="secondary" className="text-[10px]">
                      {s.badge.replace(/_/g, " ")}
                    </Badge>
                  )}
                </span>
                <span className="font-semibold">{s.score}</span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  )
}
