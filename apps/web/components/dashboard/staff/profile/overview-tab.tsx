"use client"

import dayjs from "dayjs"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { StaffDTO } from "@/components/dashboard/staff/profile/types"

type WorkloadResponse = {
  workload?: { weeklyMinutes: number; weeklyHours: number; periodsPerWeek: number }
}

export function OverviewTab({ staff }: { staff: StaffDTO }) {
  const { data } = useQuery<WorkloadResponse>({
    queryKey: ["staff-workload", staff.id],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${staff.id}/assignments`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const weeklyHours = data?.workload?.weeklyHours ?? 0
  // Heuristic workload score: capped at 35 weekly teaching hours = 100%.
  const workloadPct = Math.min(100, Math.round((weeklyHours / 35) * 100))
  const tone =
    workloadPct >= 90
      ? "text-red-600"
      : workloadPct >= 70
        ? "text-amber-600"
        : "text-emerald-600"

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Field k="Full name" v={`${staff.firstName}${staff.middleName ? " " + staff.middleName : ""} ${staff.lastName}`} />
          <Field k="Email" v={staff.email} />
          <Field k="Phone" v={staff.phone ?? "—"} />
          <Field k="Gender" v={staff.gender ? staff.gender[0] + staff.gender.slice(1).toLowerCase() : "—"} />
          <Field k="Date of birth" v={staff.dateOfBirth ? dayjs(staff.dateOfBirth).format("D MMM YYYY") : "—"} />
          <Field k="State of origin" v={staff.stateOfOrigin ?? "—"} />
          <Field k="Hire date" v={dayjs(staff.hireDate).format("D MMM YYYY")} />
          <Field k="Department" v={staff.department ?? "—"} />
          <Field k="Qualification" v={staff.qualification ?? "—"} />
          <Field k="Experience" v={`${staff.experienceYears} year${staff.experienceYears === 1 ? "" : "s"}`} />
          <Field k="Role" v={staff.role.replace("_", " ")} />
          <Field k="Type" v={staff.staffType.replace("_", " ")} />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Workload score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Badge variant={workloadPct >= 90 ? "destructive" : workloadPct >= 70 ? "secondary" : "default"}>
                {workloadPct >= 90 ? "Overloaded" : workloadPct >= 70 ? "Busy" : "Sustainable"}
              </Badge>
              <span className={cn("text-2xl font-bold tabular-nums", tone)}>{workloadPct}%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {data?.workload
                ? `${data.workload.periodsPerWeek} periods · ${weeklyHours}h/week`
                : "No timetable scheduled yet"}
            </p>
            <div className="h-2 overflow-hidden rounded bg-muted">
              <div
                className={cn(
                  "h-full transition-all",
                  workloadPct >= 90
                    ? "bg-red-500"
                    : workloadPct >= 70
                      ? "bg-amber-500"
                      : "bg-emerald-500",
                )}
                style={{ width: `${workloadPct}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {staff.subjects.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subjects taught</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1">
              {staff.subjects.map((s) => (
                <Badge key={s.id} variant="outline" className="text-[10px]">
                  {s.code}
                </Badge>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="text-sm font-medium">{v}</div>
    </div>
  )
}
