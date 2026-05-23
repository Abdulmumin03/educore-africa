"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download, Loader2, Plus, Search, Users } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { cn } from "@/lib/utils"

type StaffRow = {
  id: string
  staffNumber: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  avatarUrl: string | null
  role: string
  staffType: "TEACHING" | "NON_TEACHING" | "ADMIN" | "CONTRACT" | "NYSC"
  status: "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "RESIGNED" | "TERMINATED" | "RETIRED"
  department: string | null
  subjects: { name: string; code: string }[]
}

type Stats = { total: number; teaching: number; admin: number; onLeave: number }

type ListResponse = {
  items: StaffRow[]
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

export function StaffList({ canWrite }: { canWrite: boolean }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [role, setRole] = useState<string>("all")
  const [department, setDepartment] = useState<string>("")
  const [staffType, setStaffType] = useState<string>("all")
  const [status, setStatus] = useState<string>("all")
  const debouncedSearch = useDebounced(search, 300)
  const debouncedDept = useDebounced(department, 300)

  useEffect(() => setPage(1), [debouncedSearch, role, debouncedDept, staffType, status])

  const query = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("limit", "25")
    if (debouncedSearch) p.set("search", debouncedSearch)
    if (role !== "all") p.set("role", role)
    if (debouncedDept) p.set("department", debouncedDept)
    if (staffType !== "all") p.set("staffType", staffType)
    if (status !== "all") p.set("status", status)
    return p.toString()
  }, [page, debouncedSearch, role, debouncedDept, staffType, status])

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ["staff", query],
    queryFn: async () => {
      const res = await fetch(`/api/staff?${query}`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
    placeholderData: (prev) => prev,
  })

  function exportCsv() {
    if (!data) return
    const rows = [
      ["Staff #", "Name", "Email", "Phone", "Role", "Type", "Department", "Status", "Subjects"],
      ...data.items.map((s) => [
        s.staffNumber,
        `${s.firstName} ${s.lastName}`,
        s.email,
        s.phone ?? "",
        s.role,
        s.staffType,
        s.department ?? "",
        s.status,
        s.subjects.map((x) => x.code).join("; "),
      ]),
    ]
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `staff-page-${data.page}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const stats = data?.stats ?? { total: 0, teaching: 0, admin: 0, onLeave: 0 }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total.toLocaleString()} on record` : "Loading…"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
          {canWrite && (
            <Button size="sm" asChild>
              <Link href="/dashboard/staff/new">
                <Plus className="mr-1.5 h-4 w-4" />
                Add staff
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total staff" value={stats.total} />
        <StatTile label="Teaching" value={stats.teaching} accent="text-sky-600" />
        <StatTile label="Admin" value={stats.admin} accent="text-violet-600" />
        <StatTile label="On leave" value={stats.onLeave} accent="text-amber-600" />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, staff #, or email"
                  className="pl-8"
                />
              </div>
            </div>
            <FilterSelect
              label="Role"
              value={role}
              onChange={setRole}
              options={[
                { value: "all", label: "All roles" },
                { value: "TEACHER", label: "Teacher" },
                { value: "PRINCIPAL", label: "Principal" },
                { value: "SCHOOL_ADMIN", label: "Admin" },
                { value: "BURSAR", label: "Bursar" },
                { value: "COUNSELOR", label: "Counselor" },
                { value: "LIBRARIAN", label: "Librarian" },
                { value: "HOSTEL_MASTER", label: "Hostel master" },
                { value: "DRIVER", label: "Driver" },
              ]}
            />
            <div className="space-y-1">
              <Label className="text-xs">Department</Label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Mathematics"
              />
            </div>
            <FilterSelect
              label="Type"
              value={staffType}
              onChange={setStaffType}
              options={[
                { value: "all", label: "All types" },
                { value: "TEACHING", label: "Teaching" },
                { value: "NON_TEACHING", label: "Non-teaching" },
                { value: "ADMIN", label: "Admin" },
                { value: "CONTRACT", label: "Contract" },
                { value: "NYSC", label: "NYSC" },
              ]}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All" },
                { value: "ACTIVE", label: "Active" },
                { value: "ON_LEAVE", label: "On leave" },
                { value: "SUSPENDED", label: "Suspended" },
                { value: "RESIGNED", label: "Resigned" },
                { value: "TERMINATED", label: "Terminated" },
                { value: "RETIRED", label: "Retired" },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Staff #</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Subjects</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Loading staff…
                </TableCell>
              </TableRow>
            ) : data && data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                    <Users className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm font-medium">No staff match</p>
                    <p className="text-xs text-muted-foreground">
                      Try clearing filters, or add your first staff member.
                    </p>
                    {canWrite && (
                      <Button size="sm" asChild className="mt-2">
                        <Link href="/dashboard/staff/new">
                          <Plus className="mr-1.5 h-4 w-4" />
                          Add staff
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
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/staff/${s.id}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <Avatar className="h-8 w-8">
                          {s.avatarUrl ? <AvatarImage src={s.avatarUrl} alt={s.firstName} /> : null}
                          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <span>
                          <span className="block font-medium">
                            {s.firstName} {s.lastName}
                          </span>
                          <span className="block text-xs text-muted-foreground">{s.email}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.staffNumber}</TableCell>
                    <TableCell className="text-xs">{s.role.replace("_", " ")}</TableCell>
                    <TableCell className="text-xs">{s.department ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {s.subjects.length === 0
                        ? "—"
                        : s.subjects
                            .slice(0, 3)
                            .map((x) => x.code)
                            .join(", ") +
                          (s.subjects.length > 3 ? ` +${s.subjects.length - 3}` : "")}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/dashboard/staff/${s.id}`}>View</Link>
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
            Page {data.page} of {data.pages}
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
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
    ON_LEAVE: "secondary",
    SUSPENDED: "destructive",
    RESIGNED: "outline",
    TERMINATED: "destructive",
    RETIRED: "outline",
  }
  return (
    <Badge variant={map[status] ?? "outline"} className="text-[10px]">
      {status.replace("_", " ")}
    </Badge>
  )
}
