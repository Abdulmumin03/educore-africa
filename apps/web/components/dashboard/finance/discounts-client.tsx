"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { CheckCircle2, Loader2, Plus, Search, Trash2, UserPlus, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Textarea } from "@/components/ui/textarea"

type Discount = {
  id: string
  name: string
  type: "SIBLING" | "STAFF_CHILD" | "SCHOLARSHIP" | "NEED_BASED" | "MANUAL"
  percent: number | null
  fixedAmount: number | null
  requiresApproval: boolean
  autoApply: boolean
  isActive: boolean
  awardedCount: number
}

type Award = {
  id: string
  studentId: string
  admissionNumber: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  className: string | null
  sectionName: string | null
  discountId: string
  discountName: string
  discountType: string
  percent: number | null
  fixedAmount: number | null
  status: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED"
  reason: string | null
  approvedAt: string | null
  createdAt: string
}

export function DiscountsClient({ canApprove }: { canApprove: boolean }) {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>("PENDING")
  const [composeOpen, setComposeOpen] = useState(false)
  const [awardOpenFor, setAwardOpenFor] = useState<Discount | null>(null)

  const catalog = useQuery<{ items: Discount[] }>({
    queryKey: ["discounts-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/finance/discounts")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const awarded = useQuery<{ items: Award[] }>({
    queryKey: ["student-discounts", statusFilter],
    queryFn: async () => {
      const p = new URLSearchParams()
      if (statusFilter !== "__all__") p.set("status", statusFilter)
      const res = await fetch(`/api/finance/student-discounts?${p}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  function refresh() {
    qc.invalidateQueries({ queryKey: ["discounts-catalog"] })
    qc.invalidateQueries({ queryKey: ["student-discounts", statusFilter] })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fee discounts</h1>
          <p className="text-sm text-muted-foreground">
            Define discount rules and award them to students. Auto-apply rules (sibling)
            run automatically on invoice generation.
          </p>
        </div>
        <Button size="sm" onClick={() => setComposeOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New discount
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catalog</CardTitle>
          <CardDescription>Discount rules available to award.</CardDescription>
        </CardHeader>
        <CardContent>
          {catalog.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : !catalog.data || catalog.data.items.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              No discounts yet — add one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="text-right">Awarded</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.data.items.map((d) => (
                  <DiscountRow
                    key={d.id}
                    discount={d}
                    onAward={() => setAwardOpenFor(d)}
                    onChanged={refresh}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Awarded</CardTitle>
            <CardDescription>
              Per-student discount records. Approve, reject, or revoke from here.
            </CardDescription>
          </div>
          <div className="w-40">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="REVOKED">Revoked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {awarded.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : !awarded.data || awarded.data.items.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No records.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-56 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {awarded.data.items.map((a) => (
                  <AwardRow key={a.id} award={a} canApprove={canApprove} onChanged={refresh} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {composeOpen && <DiscountDialog onClose={() => setComposeOpen(false)} onSaved={() => { setComposeOpen(false); refresh() }} />}
      {awardOpenFor && (
        <AwardDialog
          discount={awardOpenFor}
          onClose={() => setAwardOpenFor(null)}
          onSaved={() => {
            setAwardOpenFor(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function DiscountRow({
  discount: d,
  onAward,
  onChanged,
}: {
  discount: Discount
  onAward: () => void
  onChanged: () => void
}) {
  const remove = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/finance/discounts/${d.id}`, { method: "DELETE" })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
    },
    onSuccess: () => {
      toast.success("Discount removed")
      onChanged()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const toggle = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/finance/discounts/${d.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !d.isActive }),
      })
      if (!res.ok) throw new Error("Failed")
    },
    onSuccess: onChanged,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <TableRow>
      <TableCell>
        <p className="text-sm font-medium">{d.name}</p>
        {!d.isActive && <Badge variant="outline" className="mt-1 text-[10px]">Disabled</Badge>}
      </TableCell>
      <TableCell className="text-xs">{d.type.replace("_", " ")}</TableCell>
      <TableCell className="text-right text-xs">
        {d.percent != null
          ? `${d.percent}%`
          : d.fixedAmount != null
            ? `₦${d.fixedAmount.toLocaleString()}`
            : "—"}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {d.autoApply && <Badge variant="default" className="text-[9px]">Auto-apply</Badge>}
          {d.requiresApproval && <Badge variant="secondary" className="text-[9px]">Needs approval</Badge>}
        </div>
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">{d.awardedCount}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => toggle.mutate()} disabled={toggle.isPending}>
            {d.isActive ? "Disable" : "Enable"}
          </Button>
          <Button size="sm" variant="outline" onClick={onAward}>
            <UserPlus className="mr-1 h-3 w-3" /> Award
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm(`Remove "${d.name}"? Awarded students will keep their record but new auto-apply stops.`)) {
                remove.mutate()
              }
            }}
            disabled={remove.isPending}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function AwardRow({
  award,
  canApprove,
  onChanged,
}: {
  award: Award
  canApprove: boolean
  onChanged: () => void
}) {
  const act = useMutation({
    mutationFn: async (action: "APPROVE" | "REJECT" | "REVOKE") => {
      const res = await fetch(`/api/finance/student-discounts/${award.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return action
    },
    onSuccess: (action) => {
      toast.success(`Marked ${action.toLowerCase()}`)
      onChanged()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const initials = (award.firstName[0] ?? "") + (award.lastName[0] ?? "")
  const value =
    award.percent != null ? `${award.percent}%` : award.fixedAmount != null ? `₦${award.fixedAmount.toLocaleString()}` : "—"

  const variant: Record<Award["status"], "default" | "secondary" | "destructive" | "outline"> = {
    PENDING: "secondary",
    APPROVED: "default",
    REJECTED: "destructive",
    REVOKED: "outline",
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            {award.avatarUrl ? <AvatarImage src={award.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
          <span>
            <span className="block text-sm font-medium">{award.firstName} {award.lastName}</span>
            <span className="block font-mono text-[10px] text-muted-foreground">
              {award.admissionNumber}
              {award.className ? ` · ${award.className} · ${award.sectionName}` : ""}
            </span>
          </span>
        </div>
      </TableCell>
      <TableCell className="text-xs">
        {award.discountName}
        <span className="ml-2 text-[10px] text-muted-foreground">{award.discountType.replace("_", " ")}</span>
        {award.reason && (
          <p className="mt-1 text-[10px] italic text-muted-foreground">{award.reason}</p>
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">{value}</TableCell>
      <TableCell>
        <Badge variant={variant[award.status]} className="text-[10px]">
          {award.status}
          {award.approvedAt && award.status === "APPROVED" && (
            <span className="ml-1 text-[9px] opacity-75">
              · {dayjs(award.approvedAt).format("D MMM")}
            </span>
          )}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {award.status === "PENDING" && canApprove && (
            <>
              <Button size="sm" variant="outline" onClick={() => act.mutate("APPROVE")} disabled={act.isPending}>
                <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" /> Approve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act.mutate("REJECT")} disabled={act.isPending}>
                <XCircle className="mr-1 h-3 w-3 text-red-600" /> Reject
              </Button>
            </>
          )}
          {award.status === "APPROVED" && (
            <Button size="sm" variant="ghost" onClick={() => act.mutate("REVOKE")} disabled={act.isPending}>
              Revoke
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function DiscountDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("")
  const [type, setType] = useState<Discount["type"]>("SCHOLARSHIP")
  const [mode, setMode] = useState<"percent" | "fixed">("percent")
  const [percent, setPercent] = useState("10")
  const [fixedAmount, setFixedAmount] = useState("")
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [autoApply, setAutoApply] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/finance/discounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          percent: mode === "percent" ? Number(percent) : null,
          fixedAmount: mode === "fixed" ? Number(fixedAmount) : null,
          requiresApproval,
          autoApply,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
    },
    onSuccess: () => {
      toast.success("Discount created")
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New discount</DialogTitle>
          <DialogDescription>
            Configure a discount rule. Auto-apply (e.g. sibling) runs on every invoice generation;
            others must be awarded per student.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sibling 10%" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <Select value={type} onValueChange={(v) => setType(v as Discount["type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SIBLING">Sibling</SelectItem>
                  <SelectItem value="STAFF_CHILD">Staff child</SelectItem>
                  <SelectItem value="SCHOLARSHIP">Scholarship</SelectItem>
                  <SelectItem value="NEED_BASED">Need-based</SelectItem>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Value">
              <div className="flex gap-2">
                <Select value={mode} onValueChange={(v) => setMode(v as "percent" | "fixed")}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">% off</SelectItem>
                    <SelectItem value="fixed">₦ fixed</SelectItem>
                  </SelectContent>
                </Select>
                {mode === "percent" ? (
                  <Input type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} />
                ) : (
                  <Input type="number" min={0} value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} placeholder="50000" />
                )}
              </div>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
              className="h-4 w-4"
            />
            Auto-apply (only Sibling currently uses this — looks up older active siblings)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="h-4 w-4"
            />
            Requires admin/principal approval before counting
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || name.trim().length < 2}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AwardDialog({
  discount,
  onClose,
  onSaved,
}: {
  discount: Discount
  onClose: () => void
  onSaved: () => void
}) {
  const [search, setSearch] = useState("")
  const [studentId, setStudentId] = useState("")
  const [reason, setReason] = useState("")

  const results = useQuery<{ items: Array<{ id: string; firstName: string; lastName: string; admissionNumber: string }> }>({
    queryKey: ["award-search", search],
    queryFn: async () => {
      const res = await fetch(`/api/students?search=${encodeURIComponent(search)}&limit=10`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: search.trim().length >= 2,
  })

  const award = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/finance/discounts/award", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentId, discountId: discount.id, reason }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ status: string }>
    },
    onSuccess: (d) => {
      toast.success(`Discount awarded · ${d.status.toLowerCase()}`)
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Award &quot;{discount.name}&quot;</DialogTitle>
          <DialogDescription>
            {discount.requiresApproval
              ? "Submission goes into Pending unless you can approve directly."
              : "Auto-approved on award; takes effect on the next invoice generation."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
          {results.data && results.data.items.length > 0 && (
            <ul className="divide-y rounded-md border">
              {results.data.items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setStudentId(s.id)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${studentId === s.id ? "bg-primary/5" : ""}`}
                  >
                    <span>
                      {s.firstName} {s.lastName}
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">{s.admissionNumber}</span>
                    </span>
                    {studentId === s.id && <Badge>Selected</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Field label="Reason (optional)">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Documented basis for the award" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={award.isPending}>Cancel</Button>
          <Button onClick={() => award.mutate()} disabled={award.isPending || !studentId}>
            {award.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Award
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
