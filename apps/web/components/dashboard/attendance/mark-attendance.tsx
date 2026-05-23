"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import dynamic from "next/dynamic"
import {
  CheckCircle2,
  Loader2,
  QrCode,
  Send,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// Scanner uses navigator.mediaDevices which is browser-only. Lazy-load.
const QrScanner = dynamic(
  () => import("@/components/dashboard/attendance/qr-scanner").then((m) => m.QrScanner),
  { ssr: false, loading: () => (
    <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading scanner…
    </div>
  )},
)

type ClassGroup = {
  id: string
  name: string
  sections: { id: string; name: string; enrolled: number }[]
}

type RosterStudent = {
  studentId: string
  admissionNumber: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED"
  remark: string
}

type RosterResponse = {
  section: { id: string; name: string; className: string; classId: string }
  date: string
  alreadyMarked: boolean
  students: RosterStudent[]
}

const STATUSES: Array<RosterStudent["status"]> = ["PRESENT", "ABSENT", "LATE", "EXCUSED"]

const STATUS_META: Record<
  RosterStudent["status"],
  { label: string; chip: string; activeChip: string; text: string }
> = {
  PRESENT: {
    label: "Present",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
    activeChip: "border-emerald-600 bg-emerald-600 text-white",
    text: "text-emerald-700",
  },
  ABSENT: {
    label: "Absent",
    chip: "border-red-500/40 bg-red-500/10 text-red-700",
    activeChip: "border-red-600 bg-red-600 text-white",
    text: "text-red-700",
  },
  LATE: {
    label: "Late",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-700",
    activeChip: "border-amber-600 bg-amber-600 text-white",
    text: "text-amber-700",
  },
  EXCUSED: {
    label: "Excused",
    chip: "border-sky-500/40 bg-sky-500/10 text-sky-700",
    activeChip: "border-sky-600 bg-sky-600 text-white",
    text: "text-sky-700",
  },
}

function cycleStatus(s: RosterStudent["status"]): RosterStudent["status"] {
  const i = STATUSES.indexOf(s)
  return STATUSES[(i + 1) % STATUSES.length]
}

export function MarkAttendance() {
  const qc = useQueryClient()
  const today = dayjs().format("YYYY-MM-DD")

  const [classId, setClassId] = useState<string>("")
  const [sectionId, setSectionId] = useState<string>("")
  const [date, setDate] = useState<string>(today)
  const [roster, setRoster] = useState<RosterStudent[] | null>(null)
  const [qrMode, setQrMode] = useState(false)

  // Smart class selector — teacher's assigned classes/arms.
  const mySections = useQuery<{ items: ClassGroup[] }>({
    queryKey: ["attendance-my-sections"],
    queryFn: async () => {
      const res = await fetch("/api/attendance/my-sections")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  // Auto-pick first class/section so the page lands ready to use.
  useEffect(() => {
    if (classId || !mySections.data || mySections.data.items.length === 0) return
    const first = mySections.data.items[0]
    setClassId(first.id)
    if (first.sections[0]) setSectionId(first.sections[0].id)
  }, [classId, mySections.data])

  const armsForClass = useMemo(
    () => mySections.data?.items.find((c) => c.id === classId)?.sections ?? [],
    [mySections.data, classId],
  )

  // Reset section when class changes.
  useEffect(() => {
    if (!classId) return
    const arms = mySections.data?.items.find((c) => c.id === classId)?.sections ?? []
    if (arms.length > 0 && !arms.find((a) => a.id === sectionId)) {
      setSectionId(arms[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, mySections.data])

  // Load the roster whenever section/date changes.
  const rosterQuery = useQuery<RosterResponse>({
    queryKey: ["attendance-roster", sectionId, date],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/roster?sectionId=${sectionId}&date=${date}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: !!sectionId,
  })

  useEffect(() => {
    if (rosterQuery.data) setRoster(rosterQuery.data.students)
  }, [rosterQuery.data])

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
    if (roster) for (const s of roster) c[s.status] += 1
    return c
  }, [roster])

  function setStatusFor(studentId: string, status: RosterStudent["status"]) {
    setRoster((prev) => prev?.map((r) => (r.studentId === studentId ? { ...r, status } : r)) ?? null)
  }
  function setRemarkFor(studentId: string, remark: string) {
    setRoster((prev) => prev?.map((r) => (r.studentId === studentId ? { ...r, remark } : r)) ?? null)
  }
  function markAll(status: RosterStudent["status"]) {
    setRoster((prev) => prev?.map((r) => ({ ...r, status })) ?? null)
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!roster) throw new Error("No roster loaded")
      const body = {
        classId,
        sectionId,
        date,
        entries: roster.map((r) => ({
          studentId: r.studentId,
          status: r.status,
          remark: r.remark,
        })),
      }

      // Offline path — stash the write in IndexedDB and let SyncManager
      // replay when the browser reconnects. Same (sectionId, date) key
      // overwrites prior offline edits before sync, so the user can keep
      // tweaking and only the latest version uploads.
      const isOffline =
        typeof navigator !== "undefined" && navigator.onLine === false
      if (isOffline) {
        const { enqueue } = await import("@/lib/offline-queue")
        await enqueue({
          key: `attendance:${sectionId}:${date}`,
          url: "/api/attendance",
          method: "POST",
          body,
          label: `Attendance · ${sectionId} · ${date}`,
        })
        return { saved: 0, queued: 0, counts, offline: true as const }
      }

      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ saved: number; queued: number; counts: typeof counts; offline?: false }>
    },
    onSuccess: (d) => {
      if ("offline" in d && d.offline) {
        toast.success("Saved locally — will sync when you're back online.")
      } else {
        toast.success(
          `Saved ${d.saved} entries · ${d.counts.ABSENT} absentee SMS queued (${d.queued} new)`,
        )
      }
      qc.invalidateQueries({ queryKey: ["attendance-roster", sectionId, date] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  // QR scan handler — accepts `studentId` or a JSON token, marks PRESENT/LATE.
  const qrCheckin = useMutation({
    mutationFn: async (decoded: string) => {
      let studentId = decoded.trim()
      // Allow QR payloads like `educore:student:<id>` or raw cuid.
      const m = studentId.match(/educore:student:([a-z0-9]+)/i)
      if (m) studentId = m[1]
      try {
        const parsed = JSON.parse(studentId) as { studentId?: string }
        if (parsed.studentId) studentId = parsed.studentId
      } catch {
        // not JSON — that's fine
      }
      const res = await fetch("/api/attendance/qr-checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId, sectionId, date }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Scan rejected")
      }
      return res.json() as Promise<{
        student: { id: string; name: string }
        status: "PRESENT" | "LATE"
      }>
    },
    onSuccess: (d) => {
      // Update local roster optimistically.
      setRoster(
        (prev) =>
          prev?.map((r) => (r.studentId === d.student.id ? { ...r, status: d.status } : r)) ??
          null,
      )
      toast.success(`${d.student.name} → ${d.status}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Scan failed"),
  })

  function markUnscannedAbsent() {
    setRoster(
      (prev) =>
        prev?.map((r) => (r.status === "PRESENT" ? { ...r, status: "ABSENT" } : r)) ?? null,
    )
    toast.message("Unscanned students moved to ABSENT — review then submit.")
  }

  if (mySections.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading classes…
      </div>
    )
  }

  if (!mySections.data || mySections.data.items.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          You aren&apos;t assigned to any classes yet — ask an admin to add you to a class or
          arm before marking attendance.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mark attendance</h1>
        <p className="text-sm text-muted-foreground">
          Default is all PRESENT — just change the exceptions, then submit.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {mySections.data.items.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Arm</Label>
            <Select value={sectionId} onValueChange={setSectionId} disabled={armsForClass.length === 0}>
              <SelectTrigger><SelectValue placeholder="Pick an arm" /></SelectTrigger>
              <SelectContent>
                {armsForClass.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    Arm {s.name} <span className="ml-2 text-xs text-muted-foreground">({s.enrolled})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              variant={qrMode ? "default" : "outline"}
              className="w-full"
              onClick={() => setQrMode((v) => !v)}
            >
              <QrCode className="mr-1.5 h-4 w-4" />
              {qrMode ? "Stop QR scan" : "QR scan mode"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {qrMode && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">QR check-in</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <QrScanner onScan={(text) => qrCheckin.mutate(text)} paused={qrCheckin.isPending} />
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                At the end of the lesson, mark anyone still showing PRESENT as ABSENT in bulk.
              </p>
              <Button size="sm" variant="outline" onClick={markUnscannedAbsent}>
                Mark unscanned absent
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Counters + bulk + submit */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => (
            <Badge key={s} variant="outline" className={cn("text-[11px]", STATUS_META[s].text)}>
              {STATUS_META[s].label}: <span className="ml-1 tabular-nums font-semibold">{counts[s]}</span>
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => markAll("PRESENT")}>
            <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-600" /> Mark all present
          </Button>
          <Button size="sm" variant="outline" onClick={() => markAll("ABSENT")}>
            <XCircle className="mr-1.5 h-4 w-4 text-red-600" /> Mark all absent
          </Button>
          <Button
            size="sm"
            onClick={() => submit.mutate()}
            disabled={!roster || submit.isPending}
          >
            {submit.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Submit
          </Button>
        </div>
      </div>

      {rosterQuery.isLoading || !roster ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading roster…
        </div>
      ) : roster.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            No active students enrolled in this arm.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {roster.map((r) => (
                <li key={r.studentId} className="grid grid-cols-[1fr_auto] gap-3 p-3 sm:grid-cols-[1fr_auto_2fr]">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-9 w-9">
                      {r.avatarUrl ? <AvatarImage src={r.avatarUrl} alt="" /> : null}
                      <AvatarFallback className="text-xs">
                        {r.firstName[0]}{r.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{r.firstName} {r.lastName}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{r.admissionNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatusFor(r.studentId, s)}
                        className={cn(
                          "rounded border px-2 py-1 text-[10px] uppercase transition",
                          r.status === s ? STATUS_META[s].activeChip : STATUS_META[s].chip,
                        )}
                      >
                        {STATUS_META[s].label[0]}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setStatusFor(r.studentId, cycleStatus(r.status))}
                      className="ml-1 rounded border border-muted px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
                      title="Cycle status"
                    >
                      ↻
                    </button>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    {(r.status === "ABSENT" || r.status === "EXCUSED") && (
                      <Input
                        value={r.remark}
                        onChange={(e) => setRemarkFor(r.studentId, e.target.value)}
                        placeholder={r.status === "ABSENT" ? "Reason for absence (optional)" : "Excuse reason"}
                        className="h-8 text-xs"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {rosterQuery.data?.alreadyMarked && (
        <p className="text-xs text-muted-foreground">
          Already marked for this date — your edits will overwrite the existing rows on submit.
        </p>
      )}
    </div>
  )
}
