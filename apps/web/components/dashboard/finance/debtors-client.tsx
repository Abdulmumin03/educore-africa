"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Loader2, MessageSquare, Sparkles, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

type ClassOpt = { id: string; name: string }
type TermOpt = { id: string; type: string; sessionName: string; isCurrent: boolean; sessionIsCurrent: boolean }

type DebtorRow = {
  invoiceId: string
  invoiceNo: string
  studentId: string
  admissionNumber: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  className: string | null
  sectionName: string | null
  amountDue: number
  amountPaid: number
  balance: number
  dueDate: string
  daysOverdue: number
  status: string
  guardianName: string | null
  guardianPhone: string | null
}

type DebtorsResponse = { items: DebtorRow[]; totals: { balance: number; count: number } }

type RiskItem = {
  invoiceId: string
  name: string
  admissionNumber: string
  balance: number
  daysOverdue: number
  riskLevel: string
  recommendation: string
}

type RiskResponse = { items: RiskItem[]; model: string }

export function DebtorsClient({
  canWrite,
  classes,
  terms,
}: {
  canWrite: boolean
  classes: ClassOpt[]
  terms: TermOpt[]
}) {
  const defaultTerm = terms.find((t) => t.isCurrent && t.sessionIsCurrent) ?? terms[0]
  const [termId, setTermId] = useState(defaultTerm?.id ?? "")
  const [classId, setClassId] = useState<string>("__all__")
  const [minDays, setMinDays] = useState<string>("0")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    if (termId) p.set("termId", termId)
    if (classId !== "__all__") p.set("classId", classId)
    if (Number(minDays) > 0) p.set("minDaysOverdue", minDays)
    return p.toString()
  }, [termId, classId, minDays])

  const debtors = useQuery<DebtorsResponse>({
    queryKey: ["debtors", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/finance/debtors?${queryString}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  useEffect(() => setSelected(new Set()), [queryString])

  const risk = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/payment-risk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ termId, classId: classId === "__all__" ? undefined : classId }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<RiskResponse>
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const remind = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) throw new Error("Pick at least one row")
      const res = await fetch("/api/finance/debtors/remind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceIds: ids, channels: ["SMS"] }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ smsSent: number; targeted: number }>
    },
    onSuccess: (d) => {
      toast.success(`SMS sent to ${d.smsSent}/${d.targeted} primary guardians`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  function toggleAll() {
    if (!debtors.data) return
    const ids = debtors.data.items.map((d) => d.invoiceId)
    const allSelected = ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Debtors</h1>
          <p className="text-sm text-muted-foreground">
            {debtors.data
              ? `${debtors.data.totals.count.toLocaleString()} outstanding · ₦${debtors.data.totals.balance.toLocaleString()} owed`
              : "Loading…"}
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!debtors.data) return
                remind.mutate(debtors.data.items.map((i) => i.invoiceId))
              }}
              disabled={remind.isPending || !debtors.data?.items.length}
            >
              <MessageSquare className="mr-1.5 h-4 w-4" /> Remind all
            </Button>
            <Button
              size="sm"
              onClick={() => remind.mutate(Array.from(selected))}
              disabled={remind.isPending || selected.size === 0}
            >
              {remind.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <MessageSquare className="mr-1.5 h-4 w-4" />
              )}
              Remind selected ({selected.size})
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <Field label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.sessionName} · {t.type[0] + t.type.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Class">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Min days overdue">
            <Select value={minDays} onValueChange={setMinDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Any</SelectItem>
                <SelectItem value="1">1+</SelectItem>
                <SelectItem value="7">7+</SelectItem>
                <SelectItem value="14">14+</SelectItem>
                <SelectItem value="30">30+</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">
              <Sparkles className="mr-1.5 inline h-4 w-4 text-violet-600" />
              Payment default risk
            </CardTitle>
            <CardDescription>
              AI prediction of families likely to default. Heuristic fallback when Claude isn&apos;t configured.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => risk.mutate()} disabled={risk.isPending}>
            {risk.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            {risk.data ? "Refresh" : "Run analysis"}
          </Button>
        </CardHeader>
        <CardContent>
          {!risk.data ? (
            <p className="text-sm text-muted-foreground">Run analysis to see at-risk families.</p>
          ) : risk.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No high-risk families identified.</p>
          ) : (
            <ul className="space-y-2">
              {risk.data.items.map((item) => (
                <li key={item.invoiceId} className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {item.name}{" "}
                        <span className="text-xs text-muted-foreground">· {item.admissionNumber}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ₦{item.balance.toLocaleString()} outstanding · {item.daysOverdue} days overdue
                      </p>
                    </div>
                    <Badge
                      variant={
                        item.riskLevel === "CRITICAL" || item.riskLevel === "HIGH"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      <TriangleAlert className="mr-1 h-3 w-3" />
                      {item.riskLevel}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs">{item.recommendation}</p>
                </li>
              ))}
            </ul>
          )}
          {risk.data && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Generated via {risk.data.model}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={
                      !!debtors.data &&
                      debtors.data.items.length > 0 &&
                      debtors.data.items.every((d) => selected.has(d.invoiceId))
                    }
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Days overdue</TableHead>
                <TableHead>Guardian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {debtors.isLoading && !debtors.data ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Loading…
                  </TableCell>
                </TableRow>
              ) : debtors.data && debtors.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No outstanding invoices. 🎉
                  </TableCell>
                </TableRow>
              ) : (
                debtors.data?.items.map((d) => {
                  const initials = (d.firstName[0] ?? "") + (d.lastName[0] ?? "")
                  return (
                    <TableRow key={d.invoiceId}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(d.invoiceId)}
                          onChange={() => {
                            setSelected((prev) => {
                              const next = new Set(prev)
                              if (next.has(d.invoiceId)) next.delete(d.invoiceId)
                              else next.add(d.invoiceId)
                              return next
                            })
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            {d.avatarUrl ? <AvatarImage src={d.avatarUrl} alt="" /> : null}
                            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                          </Avatar>
                          <span>
                            <span className="block text-sm font-medium">
                              {d.firstName} {d.lastName}
                            </span>
                            <span className="block font-mono text-[10px] text-muted-foreground">
                              {d.admissionNumber} · {d.invoiceNo}
                            </span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {d.className ? `${d.className} · ${d.sectionName}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold tabular-nums text-amber-700">
                        ₦{d.balance.toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-xs font-medium tabular-nums",
                          d.daysOverdue >= 30
                            ? "text-red-600"
                            : d.daysOverdue >= 7
                              ? "text-amber-600"
                              : "text-muted-foreground",
                        )}
                      >
                        {d.daysOverdue > 0 ? `${d.daysOverdue}d` : "due " + dayjs(d.dueDate).format("D MMM")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {d.guardianName ? (
                          <>
                            <p className="font-medium">{d.guardianName}</p>
                            <p className="text-[10px] text-muted-foreground">{d.guardianPhone ?? "no phone"}</p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
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
