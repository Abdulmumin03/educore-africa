"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Download, FileDown, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type ClassOpt = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}

type ClassReport = {
  section: { id: string; name: string; className: string }
  from: string | null
  to: string | null
  rows: Array<{
    studentId: string
    admissionNumber: string
    firstName: string
    lastName: string
    present: number
    absent: number
    late: number
    excused: number
    totalDays: number
    percent: number | null
  }>
}

type StudentResult = {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string
}

type StudentReport = {
  summary: {
    PRESENT: number
    ABSENT: number
    LATE: number
    EXCUSED: number
    totalDays: number
    percent: number | null
  }
  items: Array<{ date: string; status: string; remark: string | null }>
}

function tone(p: number | null) {
  if (p === null) return "text-muted-foreground"
  if (p >= 90) return "text-emerald-600"
  if (p >= 75) return "text-amber-600"
  return "text-red-600"
}

function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportsClient({ classes }: { classes: ClassOpt[] }) {
  return (
    <div className="space-y-4 print:p-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold tracking-tight">Attendance reports</h1>
        <p className="text-sm text-muted-foreground">
          Pull a student, class, or date-range report. Export as PDF or CSV, or use your
          browser&apos;s print dialog for a printable copy.
        </p>
      </div>

      <Tabs defaultValue="class" className="space-y-4 print:hidden">
        <TabsList>
          <TabsTrigger value="class">Class report</TabsTrigger>
          <TabsTrigger value="student">Student report</TabsTrigger>
          <TabsTrigger value="range">Date range</TabsTrigger>
        </TabsList>

        <TabsContent value="class">
          <ClassReportTab classes={classes} useRange={false} />
        </TabsContent>
        <TabsContent value="student">
          <StudentReportTab />
        </TabsContent>
        <TabsContent value="range">
          <ClassReportTab classes={classes} useRange />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ClassReportTab({ classes, useRange }: { classes: ClassOpt[]; useRange: boolean }) {
  const [classId, setClassId] = useState<string>(classes[0]?.id ?? "")
  const arms = useMemo(
    () => classes.find((c) => c.id === classId)?.sections ?? [],
    [classes, classId],
  )
  const [sectionId, setSectionId] = useState<string>(arms[0]?.id ?? "")
  const [from, setFrom] = useState(dayjs().startOf("month").format("YYYY-MM-DD"))
  const [to, setTo] = useState(dayjs().format("YYYY-MM-DD"))

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    p.set("sectionId", sectionId)
    if (useRange) {
      p.set("from", from)
      p.set("to", to)
    }
    return p.toString()
  }, [sectionId, useRange, from, to])

  const report = useQuery<ClassReport>({
    queryKey: ["class-report", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/class-report?${queryString}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: !!sectionId,
  })

  function exportCsv() {
    if (!report.data) return
    const header = [
      "Admission no.",
      "Last name",
      "First name",
      "Present",
      "Late",
      "Absent",
      "Excused",
      "Total days",
      "Attendance %",
    ]
    const rows: (string | number | null)[][] = [header]
    for (const r of report.data.rows) {
      rows.push([
        r.admissionNumber,
        r.lastName,
        r.firstName,
        r.present,
        r.late,
        r.absent,
        r.excused,
        r.totalDays,
        r.percent ?? "",
      ])
    }
    downloadCsv(`attendance-${report.data.section.className}-arm${report.data.section.name}.csv`, rows)
  }

  function exportPdf() {
    if (!sectionId) return
    const url = new URL("/api/attendance/reports/pdf", window.location.origin)
    url.searchParams.set("type", "class")
    url.searchParams.set("sectionId", sectionId)
    if (useRange) {
      url.searchParams.set("from", from)
      url.searchParams.set("to", to)
    }
    window.open(url.toString(), "_blank")
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {useRange ? "Date-range report" : "Class report"}
        </CardTitle>
        <CardDescription>
          {useRange
            ? "Pick a class arm and a custom date window."
            : "Defaults to the current term."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn("grid gap-3", useRange ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
          <Field label="Class">
            <Select value={classId} onValueChange={(v) => { setClassId(v); setSectionId(classes.find((c) => c.id === v)?.sections[0]?.id ?? "") }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Arm">
            <Select value={sectionId} onValueChange={setSectionId} disabled={arms.length === 0}>
              <SelectTrigger><SelectValue placeholder="Pick an arm" /></SelectTrigger>
              <SelectContent>
                {arms.map((s) => (
                  <SelectItem key={s.id} value={s.id}>Arm {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {useRange && (
            <>
              <Field label="From">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To">
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {report.data?.from
              ? `${report.data.from} → ${report.data.to ?? report.data.from}`
              : "Current term"}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!report.data}>
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </Button>
            <Button size="sm" onClick={exportPdf} disabled={!sectionId}>
              <FileDown className="mr-1.5 h-4 w-4" /> PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        </div>

        {report.isLoading || !report.data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Adm. no.</TableHead>
                <TableHead className="text-right">P</TableHead>
                <TableHead className="text-right">L</TableHead>
                <TableHead className="text-right">A</TableHead>
                <TableHead className="text-right">E</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.data.rows.map((r) => (
                <TableRow key={r.studentId}>
                  <TableCell className="text-sm">
                    {r.firstName} {r.lastName}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.admissionNumber}</TableCell>
                  <TableCell className="text-right text-xs">{r.present}</TableCell>
                  <TableCell className="text-right text-xs">{r.late}</TableCell>
                  <TableCell className="text-right text-xs">{r.absent}</TableCell>
                  <TableCell className="text-right text-xs">{r.excused}</TableCell>
                  <TableCell className="text-right text-xs">{r.totalDays}</TableCell>
                  <TableCell className={cn("text-right text-xs font-medium tabular-nums", tone(r.percent))}>
                    {r.percent === null ? "—" : `${r.percent}%`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function StudentReportTab() {
  const [search, setSearch] = useState("")
  const [studentId, setStudentId] = useState<string>("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const results = useQuery<{ items: StudentResult[]; total: number }>({
    queryKey: ["report-student-search", search],
    queryFn: async () => {
      const res = await fetch(`/api/students?search=${encodeURIComponent(search)}&limit=10`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: search.trim().length >= 2,
  })

  const report = useQuery<StudentReport>({
    queryKey: ["student-report", studentId, from, to],
    queryFn: async () => {
      const p = new URLSearchParams({ studentId })
      if (from) p.set("from", from)
      if (to) p.set("to", to)
      const res = await fetch(`/api/attendance/summary?${p.toString()}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: !!studentId,
  })

  const selected = results.data?.items.find((s) => s.id === studentId)

  function exportPdf() {
    if (!studentId) {
      toast.error("Pick a student first")
      return
    }
    const url = new URL("/api/attendance/reports/pdf", window.location.origin)
    url.searchParams.set("type", "student")
    url.searchParams.set("studentId", studentId)
    if (from) url.searchParams.set("from", from)
    if (to) url.searchParams.set("to", to)
    window.open(url.toString(), "_blank")
  }

  function exportCsv() {
    if (!report.data) return
    const rows: (string | number | null)[][] = [
      ["Date", "Status", "Remark"],
      ...report.data.items.map((i) => [i.date, i.status, i.remark ?? ""]),
    ]
    downloadCsv(`attendance-${selected?.admissionNumber ?? studentId}.csv`, rows)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Student report</CardTitle>
        <CardDescription>Defaults to the current term unless you set a range.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Search student">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or admission no."
                className="pl-8"
              />
            </div>
          </Field>
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>

        {results.data && results.data.items.length > 0 && (
          <div className="rounded-md border">
            <ul className="divide-y">
              {results.data.items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setStudentId(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                      studentId === s.id && "bg-primary/5",
                    )}
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px]">
                        {s.firstName[0]}{s.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1">
                      {s.firstName} {s.lastName}{" "}
                      <span className="text-xs text-muted-foreground">· {s.admissionNumber}</span>
                    </span>
                    {studentId === s.id && <Badge variant="default">Selected</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {studentId && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Reporting on {selected ? `${selected.firstName} ${selected.lastName}` : studentId}
              {from || to ? ` · ${from || "earliest"} → ${to || "latest"}` : " (current term)"}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!report.data}>
                <Download className="mr-1.5 h-4 w-4" /> CSV
              </Button>
              <Button size="sm" onClick={exportPdf}>
                <FileDown className="mr-1.5 h-4 w-4" /> PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                Print
              </Button>
            </div>
          </div>
        )}

        {studentId && (report.isLoading || !report.data) ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : null}

        {report.data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Kpi label="%" value={report.data.summary.percent === null ? "—" : `${report.data.summary.percent}%`} accent={tone(report.data.summary.percent)} />
              <Kpi label="Present" value={String(report.data.summary.PRESENT)} />
              <Kpi label="Late" value={String(report.data.summary.LATE)} />
              <Kpi label="Absent" value={String(report.data.summary.ABSENT)} />
              <Kpi label="Excused" value={String(report.data.summary.EXCUSED)} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data.items.slice(0, 60).map((i, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-xs">{i.date}</TableCell>
                    <TableCell className="text-xs">{i.status}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.remark ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-xl font-bold tabular-nums", accent)}>{value}</p>
    </div>
  )
}
