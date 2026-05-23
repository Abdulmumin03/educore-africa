"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Building2,
  ClipboardCheck,
  Loader2,
  Megaphone,
  School,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"

type SummaryItem = {
  id: string
  name: string
  slug: string
  city: string | null
  country: string
  currency: string
  logoUrl: string | null
  kpis: {
    students: number
    attendancePct: number | null
    feeCollectionPct: number | null
    avgGrade: number | null
  }
}

type FinanceRow = {
  schoolId: string
  name: string
  currency: string
  billed: number
  paid: number
  outstanding: number
  paymentCount: number
  ratePct: number
}

type FinanceResponse = {
  network: {
    schoolCount: number
    billed: number
    paid: number
    outstanding: number
    paymentCount: number
    ratePct: number
  }
  rows: FinanceRow[]
}

type Sort = "students" | "attendancePct" | "feeCollectionPct" | "avgGrade"

const money = (n: number, ccy = "NGN") =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: 0,
  }).format(n)

export function NetworkDashboard() {
  const [tab, setTab] = useState<"grid" | "table" | "finance">("grid")
  const [broadcastOpen, setBroadcastOpen] = useState(false)

  const summary = useQuery<{ items: SummaryItem[] }>({
    queryKey: ["network-summary"],
    queryFn: async () => {
      const res = await fetch("/api/network/summary")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const finance = useQuery<FinanceResponse>({
    queryKey: ["network-consolidated-finance"],
    queryFn: async () => {
      const res = await fetch("/api/network/consolidated-finance")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: tab === "finance",
  })

  const schools = summary.data?.items ?? []
  const aggregates = aggregateNetwork(schools)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Network dashboard</h1>
          <p className="text-sm text-muted-foreground">
            All schools you manage, side-by-side. Switch to a single school&apos;s view with the &quot;Visit&quot; button.
          </p>
        </div>
        <Button size="sm" onClick={() => setBroadcastOpen(true)}>
          <Megaphone className="mr-1.5 h-4 w-4" />
          Network broadcast
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile icon={School} label="Schools" value={aggregates.schoolCount} loading={summary.isLoading} />
        <StatTile icon={Users} label="Students (active)" value={aggregates.students} loading={summary.isLoading} />
        <StatTile
          icon={ClipboardCheck}
          label="Avg attendance (30d)"
          value={aggregates.attendancePct === null ? "—" : `${aggregates.attendancePct}%`}
          loading={summary.isLoading}
        />
        <StatTile
          icon={Wallet}
          label="Avg fee collection"
          value={aggregates.feeCollectionPct === null ? "—" : `${aggregates.feeCollectionPct}%`}
          loading={summary.isLoading}
        />
        <StatTile
          icon={TrendingUp}
          label="Avg grade"
          value={aggregates.avgGrade === null ? "—" : aggregates.avgGrade.toFixed(1)}
          loading={summary.isLoading}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="grid">Schools</TabsTrigger>
          <TabsTrigger value="table">Comparison</TabsTrigger>
          <TabsTrigger value="finance">Consolidated finance</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "grid" && (
        <SchoolGrid schools={schools} loading={summary.isLoading} />
      )}
      {tab === "table" && (
        <ComparisonTable schools={schools} loading={summary.isLoading} />
      )}
      {tab === "finance" && (
        <ConsolidatedFinance data={finance.data} loading={finance.isLoading} />
      )}

      {broadcastOpen && (
        <BroadcastDialog
          schoolCount={schools.length}
          onClose={() => setBroadcastOpen(false)}
        />
      )}
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof Users
  label: string
  value: number | string
  loading: boolean
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-2xl font-bold">{value}</p>}
      </CardContent>
    </Card>
  )
}

function aggregateNetwork(items: SummaryItem[]) {
  if (items.length === 0) {
    return {
      schoolCount: 0,
      students: 0,
      attendancePct: null as number | null,
      feeCollectionPct: null as number | null,
      avgGrade: null as number | null,
    }
  }
  const students = items.reduce((s, i) => s + i.kpis.students, 0)
  const attRates = items.map((i) => i.kpis.attendancePct).filter((x): x is number => x !== null)
  const feeRates = items.map((i) => i.kpis.feeCollectionPct).filter((x): x is number => x !== null)
  const grades = items.map((i) => i.kpis.avgGrade).filter((x): x is number => x !== null)
  return {
    schoolCount: items.length,
    students,
    attendancePct: attRates.length > 0 ? Math.round(attRates.reduce((s, n) => s + n, 0) / attRates.length) : null,
    feeCollectionPct: feeRates.length > 0 ? Math.round(feeRates.reduce((s, n) => s + n, 0) / feeRates.length) : null,
    avgGrade: grades.length > 0 ? grades.reduce((s, n) => s + n, 0) / grades.length : null,
  }
}

function SchoolGrid({ schools, loading }: { schools: SummaryItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    )
  }
  if (schools.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No schools provisioned yet.</p>
        </CardContent>
      </Card>
    )
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {schools.map((s) => (
        <li key={s.id}>
          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start gap-3">
                {s.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.logoUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <School className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{s.name}</h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {[s.city, s.country].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <Kpi label="Students" value={s.kpis.students.toLocaleString()} />
                <Kpi label="Attendance" value={pct(s.kpis.attendancePct)} />
                <Kpi label="Fee collection" value={pct(s.kpis.feeCollectionPct)} />
                <Kpi label="Avg grade" value={s.kpis.avgGrade !== null ? s.kpis.avgGrade.toFixed(1) : "—"} />
              </div>
              <Button asChild variant="outline" size="sm" className="w-full">
                <a href={`/network-dashboard/${s.id}`}>Visit school dashboard</a>
              </Button>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}

function pct(v: number | null): string {
  return v === null ? "—" : `${v}%`
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

function ComparisonTable({
  schools,
  loading,
}: {
  schools: SummaryItem[]
  loading: boolean
}) {
  const [sort, setSort] = useState<Sort>("students")
  if (loading) return <Skeleton className="h-72" />
  if (schools.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No schools yet.
        </CardContent>
      </Card>
    )
  }

  const ranked = [...schools].sort((a, b) => {
    const av = a.kpis[sort] ?? -Infinity
    const bv = b.kpis[sort] ?? -Infinity
    return (bv as number) - (av as number)
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Label className="text-xs">Rank by</Label>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="students">Enrolment</SelectItem>
            <SelectItem value="attendancePct">Attendance %</SelectItem>
            <SelectItem value="feeCollectionPct">Fee collection %</SelectItem>
            <SelectItem value="avgGrade">Average grade</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">School</th>
                <th className="p-3 text-right">Students</th>
                <th className="p-3 text-right">Attendance</th>
                <th className="p-3 text-right">Fee collection</th>
                <th className="p-3 text-right">Avg grade</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => (
                <tr key={s.id} className="border-b last:border-b-0">
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {[s.city, s.country].filter(Boolean).join(", ")}
                    </div>
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {s.kpis.students.toLocaleString()}
                  </td>
                  <td className="p-3 text-right">{pct(s.kpis.attendancePct)}</td>
                  <td className="p-3 text-right">{pct(s.kpis.feeCollectionPct)}</td>
                  <td className="p-3 text-right">
                    {s.kpis.avgGrade !== null ? s.kpis.avgGrade.toFixed(1) : "—"}
                  </td>
                  <td className="p-3 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <a href={`/network-dashboard/${s.id}`}>Visit →</a>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function ConsolidatedFinance({
  data,
  loading,
}: {
  data: FinanceResponse | undefined
  loading: boolean
}) {
  if (loading || !data) return <Skeleton className="h-72" />
  const { network, rows } = data
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile icon={Wallet} label="Total billed" value={money(network.billed)} loading={false} />
        <StatTile icon={Wallet} label="Total collected" value={money(network.paid)} loading={false} />
        <StatTile icon={TrendingUp} label="Outstanding" value={money(network.outstanding)} loading={false} />
        <StatTile icon={Wallet} label="Collection rate" value={`${network.ratePct}%`} loading={false} />
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3">School</th>
                <th className="p-3 text-right">Billed</th>
                <th className="p-3 text-right">Paid</th>
                <th className="p-3 text-right">Outstanding</th>
                <th className="p-3 text-right">Payments</th>
                <th className="p-3 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.schoolId} className="border-b last:border-b-0">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3 text-right">{money(r.billed, r.currency)}</td>
                  <td className="p-3 text-right">{money(r.paid, r.currency)}</td>
                  <td className="p-3 text-right text-amber-700">
                    {money(r.outstanding, r.currency)}
                  </td>
                  <td className="p-3 text-right text-muted-foreground">
                    {r.paymentCount.toLocaleString()}
                  </td>
                  <td className="p-3 text-right font-semibold">{r.ratePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function BroadcastDialog({
  schoolCount,
  onClose,
}: {
  schoolCount: number
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [priority, setPriority] = useState<"NORMAL" | "IMPORTANT" | "URGENT">("NORMAL")

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/network/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), priority }),
      })
      const b = (await res.json().catch(() => ({}))) as {
        error?: string
        created?: number
      }
      if (!res.ok) throw new Error(b.error ?? "Failed")
      return b.created ?? 0
    },
    onSuccess: (count) => {
      toast.success(`Posted to ${count} school${count === 1 ? "" : "s"}`)
      qc.invalidateQueries({ queryKey: ["announcements"] })
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Network-wide broadcast</DialogTitle>
          <DialogDescription>
            Creates an announcement in every school ({schoolCount}). Per-school
            channel dispatch happens through each school&apos;s own announcement composer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Body</Label>
            <Textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              placeholder="What do you want everyone to know?"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="IMPORTANT">Important</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={
              title.trim().length < 2 || body.trim().length < 2 || submit.isPending
            }
          >
            {submit.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Broadcast
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
