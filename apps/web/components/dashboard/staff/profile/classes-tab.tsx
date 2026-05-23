"use client"

import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

type AssignmentsResponse = {
  subjects: { id: string; name: string; code: string; category: string }[]
  sections: {
    id: string
    className: string
    sectionName: string
    academicYearName: string
    isCurrent: boolean
    subjectName: string | null
  }[]
  formTeacherOf: { className: string; sectionName: string }[]
  timetable: {
    id: string
    dayOfWeek: number
    startTime: string
    endTime: string
    subject: string
    className: string
    sectionName: string
    room: string | null
  }[]
  workload: { weeklyMinutes: number; weeklyHours: number; periodsPerWeek: number }
}

export function ClassesTab({ staffId }: { staffId: string }) {
  const { data, isLoading } = useQuery<AssignmentsResponse>({
    queryKey: ["staff-assignments", staffId],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${staffId}/assignments`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  const currentSections = data.sections.filter((s) => s.isCurrent)
  const pastSections = data.sections.filter((s) => !s.isCurrent)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Periods / week" value={String(data.workload.periodsPerWeek)} />
        <KpiCard label="Teaching hours / week" value={`${data.workload.weeklyHours}h`} />
        <KpiCard label="Subjects" value={String(data.subjects.length)} />
      </div>

      {data.formTeacherOf.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Form teacher of</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            {data.formTeacherOf.map((f, i) => (
              <Badge key={i} variant="default">
                {f.className} · Arm {f.sectionName}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {currentSections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments this session.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {currentSections.map((sec) => (
                <li key={sec.id} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <span className="font-medium">{sec.className} · Arm {sec.sectionName}</span>
                  {sec.subjectName && (
                    <span className="ml-2 text-xs text-muted-foreground">({sec.subjectName})</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly timetable</CardTitle>
        </CardHeader>
        <CardContent>
          {data.timetable.length === 0 ? (
            <p className="text-sm text-muted-foreground">No timetable rows yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Class · Arm</TableHead>
                  <TableHead>Room</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.timetable
                  .slice()
                  .sort((a, b) =>
                    a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
                  )
                  .map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{DAYS[t.dayOfWeek] ?? t.dayOfWeek}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {t.startTime}–{t.endTime}
                      </TableCell>
                      <TableCell className="text-xs">{t.subject}</TableCell>
                      <TableCell className="text-xs">
                        {t.className} · {t.sectionName}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.room ?? "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pastSections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Past assignments</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {pastSections.map((sec) => (
                <li key={sec.id} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-1.5">
                  <span>
                    {sec.className} · Arm {sec.sectionName}
                    {sec.subjectName ? ` (${sec.subjectName})` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">{sec.academicYearName}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
