"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import {
  Download,
  Loader2,
  MessageSquare,
  Plus,
  Printer,
  Search,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { StudentQrCard } from "@/components/dashboard/students/qr-card"
import { cn } from "@/lib/utils"

type ClassOpt = { id: string; name: string; sections: { id: string; name: string }[] }

type StudentRow = {
  id: string
  admissionNumber: string
  firstName: string
  lastName: string
  middleName: string | null
  avatarUrl: string | null
  gender: "MALE" | "FEMALE" | "OTHER"
  status: string
  className: string | null
  sectionName: string | null
  balance: number
}

type Stats = { total: number; boys: number; girls: number; newThisTerm: number }

type ListResponse = {
  items: StudentRow[]
  page: number
  limit: number
  total: number
  pages: number
  stats: Stats
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

export function StudentsList({
  canWrite,
  classes,
  currentSession,
}: {
  canWrite: boolean
  classes: ClassOpt[]
  currentSession: string | null
}) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [classId, setClassId] = useState<string>("all")
  const [sectionId, setSectionId] = useState<string>("all")
  const [gender, setGender] = useState<string>("all")
  const [status, setStatus] = useState<string>("all")
  const [feeStatus, setFeeStatus] = useState<string>("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [smsOpen, setSmsOpen] = useState(false)
  const [smsMessage, setSmsMessage] = useState("")
  const [printOpen, setPrintOpen] = useState(false)
  const debouncedSearch = useDebounced(search, 300)

  const sectionsForClass = classId === "all" ? [] : classes.find((c) => c.id === classId)?.sections ?? []

  // Reset section if class changes.
  useEffect(() => setSectionId("all"), [classId])
  useEffect(() => setPage(1), [debouncedSearch, classId, sectionId, gender, status, feeStatus])

  const query = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("limit", "25")
    if (debouncedSearch) p.set("search", debouncedSearch)
    if (classId !== "all") p.set("classId", classId)
    if (sectionId !== "all") p.set("sectionId", sectionId)
    if (gender !== "all") p.set("gender", gender)
    if (status !== "all") p.set("status", status)
    if (feeStatus !== "all") p.set("feeStatus", feeStatus)
    return p.toString()
  }, [page, debouncedSearch, classId, sectionId, gender, status, feeStatus])

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ["students", query],
    queryFn: async () => {
      const res = await fetch(`/api/students?${query}`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
    placeholderData: (prev) => prev,
  })

  const bulkSms = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/students/bulk-sms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentIds: Array.from(selected),
          message: smsMessage,
          audience: "guardians",
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? "Bulk SMS failed")
      }
      return res.json() as Promise<{ sent: number; recipients: number; students: number }>
    },
    onSuccess: (d) => {
      toast.success(`Sent to ${d.sent}/${d.recipients} guardians (${d.students} students)`)
      setSmsOpen(false)
      setSmsMessage("")
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  function toggleAll() {
    if (!data) return
    const next = new Set(selected)
    const allSelected = data.items.every((i) => next.has(i.id))
    if (allSelected) data.items.forEach((i) => next.delete(i.id))
    else data.items.forEach((i) => next.add(i.id))
    setSelected(next)
  }

  function toggleOne(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function exportCsv() {
    const url = `/api/students/export?format=csv&${query.replace(/(^|&)(page|limit)=[^&]*/g, "")}`
    window.location.href = url
  }

  const stats = data?.stats ?? { total: 0, boys: 0, girls: 0, newThisTerm: 0 }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Students</h1>
          <p className="text-sm text-muted-foreground">
            {currentSession ? `${currentSession} session` : "No active session"}
            {data ? ` · ${data.total.toLocaleString()} on record` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selected.size === 0}
            onClick={() => setSmsOpen(true)}
          >
            <MessageSquare className="mr-1.5 h-4 w-4" />
            Send SMS ({selected.size})
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selected.size === 0}
            onClick={() => setPrintOpen(true)}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Print IDs
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/students/qr-cards">QR cards</Link>
          </Button>
          {canWrite && (
            <Button size="sm" asChild>
              <Link href="/dashboard/students/new">
                <Plus className="mr-1.5 h-4 w-4" />
                Add student
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total students" value={stats.total} />
        <StatTile label="Boys" value={stats.boys} accent="text-sky-600" />
        <StatTile label="Girls" value={stats.girls} accent="text-pink-600" />
        <StatTile label="New this term" value={stats.newThisTerm} accent="text-emerald-600" />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]">
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name or admission no."
                  className="pl-8"
                />
              </div>
            </div>
            <Filter label="Class" value={classId} onChange={setClassId} options={[
              { value: "all", label: "All classes" },
              ...classes.map((c) => ({ value: c.id, label: c.name })),
            ]} />
            <Filter
              label="Arm"
              value={sectionId}
              onChange={setSectionId}
              disabled={classId === "all"}
              options={[
                { value: "all", label: "All arms" },
                ...sectionsForClass.map((s) => ({ value: s.id, label: `Arm ${s.name}` })),
              ]}
            />
            <Filter label="Gender" value={gender} onChange={setGender} options={[
              { value: "all", label: "All" },
              { value: "MALE", label: "Male" },
              { value: "FEMALE", label: "Female" },
              { value: "OTHER", label: "Other" },
            ]} />
            <Filter label="Status" value={status} onChange={setStatus} options={[
              { value: "all", label: "All" },
              { value: "ACTIVE", label: "Active" },
              { value: "GRADUATED", label: "Graduated" },
              { value: "TRANSFERRED", label: "Transferred" },
              { value: "WITHDRAWN", label: "Withdrawn" },
              { value: "SUSPENDED", label: "Suspended" },
            ]} />
            <Filter label="Fees" value={feeStatus} onChange={setFeeStatus} options={[
              { value: "all", label: "All" },
              { value: "PENDING", label: "Pending" },
              { value: "PARTIAL", label: "Partial" },
              { value: "PAID", label: "Paid" },
              { value: "OVERDUE", label: "Overdue" },
              { value: "WAIVED", label: "Waived" },
            ]} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={
                    !!data && data.items.length > 0 && data.items.every((i) => selected.has(i.id))
                  }
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Admission no.</TableHead>
              <TableHead>Class / Arm</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Balance (₦)</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Loading students…
                </TableCell>
              </TableRow>
            ) : data && data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                    <Users className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm font-medium">No students match</p>
                    <p className="text-xs text-muted-foreground">
                      Try clearing filters, or add your first student.
                    </p>
                    {canWrite && (
                      <Button size="sm" asChild className="mt-2">
                        <Link href="/dashboard/students/new">
                          <Plus className="mr-1.5 h-4 w-4" />
                          Add student
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((s) => {
                const initials = `${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase()
                return (
                  <TableRow key={s.id} className="cursor-default">
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleOne(s.id)}
                        aria-label={`Select ${s.firstName} ${s.lastName}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/students/${s.id}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <Avatar className="h-8 w-8">
                          {s.avatarUrl ? (
                            <AvatarImage src={s.avatarUrl} alt={s.firstName} />
                          ) : null}
                          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {s.firstName} {s.middleName ? s.middleName + " " : ""}
                          {s.lastName}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.admissionNumber}</TableCell>
                    <TableCell>
                      {s.className ? (
                        <span>
                          {s.className} {s.sectionName ? `· ${s.sectionName}` : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not enrolled</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.gender[0] + s.gender.slice(1).toLowerCase()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        s.balance > 0 ? "text-destructive font-medium" : "text-muted-foreground",
                      )}
                    >
                      {s.balance.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/dashboard/students/${s.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.page} of {data.pages} · showing{" "}
            {data.items.length === 0
              ? 0
              : (data.page - 1) * data.limit + 1}
            –{(data.page - 1) * data.limit + data.items.length}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send SMS</DialogTitle>
            <DialogDescription>
              The message goes to the primary guardian of every selected student.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={smsMessage}
            onChange={(e) => setSmsMessage(e.target.value)}
            placeholder="Reminder: school resumes Monday 8am."
            rows={4}
            maxLength={280}
          />
          <p className="text-xs text-muted-foreground">
            {smsMessage.length}/280 characters · {selected.size} student(s) selected
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSmsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => bulkSms.mutate()}
              disabled={smsMessage.trim().length < 2 || bulkSms.isPending}
            >
              {bulkSms.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Print ID cards</DialogTitle>
            <DialogDescription>
              Preview the {selected.size} selected card{selected.size === 1 ? "" : "s"} with QR codes.
              Need bulk options or filters? Use the{" "}
              <Link href="/dashboard/students/qr-cards" className="underline">
                QR cards page
              </Link>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-96 flex-wrap gap-3 overflow-y-auto print:max-h-none">
            {data?.items
              .filter((s) => selected.has(s.id))
              .map((s) => (
                <StudentQrCard
                  key={s.id}
                  student={{
                    id: s.id,
                    firstName: s.firstName,
                    lastName: s.lastName,
                    admissionNumber: s.admissionNumber,
                    className: s.className,
                    sectionName: s.sectionName,
                    avatarUrl: s.avatarUrl,
                  }}
                  schoolName="EduCore Africa"
                />
              ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPrintOpen(false)}>
              Close
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatTile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold tabular-nums", accent)}>
          {value.toLocaleString()}
        </p>
      </CardContent>
    </Card>
  )
}

function Filter({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    ACTIVE: "default",
    GRADUATED: "secondary",
    TRANSFERRED: "secondary",
    WITHDRAWN: "outline",
    SUSPENDED: "destructive",
    DECEASED: "outline",
  }
  return (
    <Badge variant={map[status] ?? "outline"} className="text-[10px]">
      {status[0] + status.slice(1).toLowerCase()}
    </Badge>
  )
}
