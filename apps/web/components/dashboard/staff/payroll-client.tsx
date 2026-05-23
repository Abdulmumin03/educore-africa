"use client"

import { useState } from "react"
import dayjs from "dayjs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Banknote, CheckCircle2, Download, Loader2, Plus, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Period = {
  id: string
  name: string
  startDate: string
  endDate: string
  processedAt: string | null
  payslipCount: number
  paidCount: number
  totalGross: number
  totalNet: number
}

type PayslipRow = {
  id: string
  staff: {
    id: string
    staffNumber: string
    firstName: string
    lastName: string
    department: string | null
  }
  basicSalary: number
  allowances: { name: string; amount: number }[]
  deductions: { name: string; amount: number }[]
  gross: number
  net: number
  paidAt: string | null
  note: string | null
}

type PeriodDetail = {
  id: string
  name: string
  startDate: string
  endDate: string
  processedAt: string | null
  payslips: PayslipRow[]
}

export function PayrollClient({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient()
  const [newOpen, setNewOpen] = useState(false)
  const [openPeriodId, setOpenPeriodId] = useState<string | null>(null)

  const periods = useQuery<{ items: Period[] }>({
    queryKey: ["payroll-periods"],
    queryFn: async () => {
      const res = await fetch("/api/staff/payroll/periods")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Create monthly payroll periods and generate payslips from each staff member&apos;s
            salary structure.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New payroll period
          </Button>
        )}
      </div>

      {periods.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !periods.data || periods.data.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <Banknote className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">No payroll periods yet</p>
            <p className="text-xs text-muted-foreground">
              Create your first period (e.g. <span className="font-mono">2026-05</span>) and
              generate payslips from each staff member&apos;s salary structure.
            </p>
            {canWrite && (
              <Button size="sm" className="mt-2" onClick={() => setNewOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Create period
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {periods.data.items.map((p) => (
            <Card key={p.id} className="cursor-pointer hover:border-primary/40" onClick={() => setOpenPeriodId(p.id)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <CardDescription>
                      {dayjs(p.startDate).format("D MMM")} – {dayjs(p.endDate).format("D MMM YYYY")}
                    </CardDescription>
                  </div>
                  <Badge variant={p.processedAt ? "default" : "outline"}>
                    {p.processedAt ? "Processed" : "Draft"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 text-sm">
                <Stat label="Payslips" value={String(p.payslipCount)} />
                <Stat label="Paid" value={`${p.paidCount}/${p.payslipCount}`} />
                <Stat label="Net total" value={`₦${p.totalNet.toLocaleString()}`} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {newOpen && (
        <NewPeriodDialog
          onClose={() => setNewOpen(false)}
          onCreated={() => {
            setNewOpen(false)
            qc.invalidateQueries({ queryKey: ["payroll-periods"] })
          }}
        />
      )}

      {openPeriodId && (
        <PeriodDialog
          periodId={openPeriodId}
          canWrite={canWrite}
          onClose={() => setOpenPeriodId(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["payroll-periods"] })
            qc.invalidateQueries({ queryKey: ["payroll-period", openPeriodId] })
          }}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  )
}

function NewPeriodDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const now = new Date()
  const monthName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [name, setName] = useState(monthName)
  const [startDate, setStartDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10))

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff/payroll/periods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, startDate, endDate }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success("Period created")
      onCreated()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New payroll period</DialogTitle>
          <DialogDescription>
            Define the date window. You&apos;ll generate payslips after creating it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Period name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PeriodDialog({
  periodId,
  canWrite,
  onClose,
  onChanged,
}: {
  periodId: string
  canWrite: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<PeriodDetail>({
    queryKey: ["payroll-period", periodId],
    queryFn: async () => {
      const res = await fetch(`/api/staff/payroll/periods/${periodId}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/staff/payroll/periods/${periodId}/generate`, {
        method: "POST",
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ generated: number; skipped: number; message?: string }>
    },
    onSuccess: (d) => {
      toast.success(
        d.generated === 0
          ? d.message ?? "Nothing to generate"
          : `Generated ${d.generated} payslip(s), skipped ${d.skipped}`,
      )
      qc.invalidateQueries({ queryKey: ["payroll-period", periodId] })
      onChanged()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  const markPaid = useMutation({
    mutationFn: async (payslipId: string) => {
      const res = await fetch(`/api/staff/payroll/payslips/${payslipId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "MARK_PAID" }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success("Marked paid")
      qc.invalidateQueries({ queryKey: ["payroll-period", periodId] })
      onChanged()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  function downloadPdf(payslipId: string, staffId: string) {
    window.open(`/api/staff/${staffId}/payslips/${payslipId}/pdf`, "_blank")
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {data ? `Payroll · ${data.name}` : "Loading…"}
          </DialogTitle>
          {data && (
            <DialogDescription>
              {dayjs(data.startDate).format("D MMM")} – {dayjs(data.endDate).format("D MMM YYYY")}
              {data.processedAt
                ? ` · processed ${dayjs(data.processedAt).format("D MMM YYYY HH:mm")}`
                : " · draft"}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3 text-sm">
              <div>
                <Sparkles className="mr-1 inline h-4 w-4 text-violet-600" />
                Generate payslips for every active staff member with a basic salary set.
              </div>
              {canWrite && (
                <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
                  {generate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Generate payslips
                </Button>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {data.payslips.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No payslips yet. Click <em>Generate payslips</em> to create them.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-32" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.payslips.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[10px]">
                                {p.staff.firstName[0]}
                                {p.staff.lastName[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">
                                {p.staff.firstName} {p.staff.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {p.staff.staffNumber}
                                {p.staff.department ? ` · ${p.staff.department}` : ""}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          ₦{p.gross.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          ₦{p.deductions.reduce((a, l) => a + l.amount, 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold">
                          ₦{p.net.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {p.paidAt ? (
                            <Badge variant="default" className="text-[10px]">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              {dayjs(p.paidAt).format("D MMM")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadPdf(p.id, p.staff.id)}
                              title="Download PDF"
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                            {canWrite && !p.paidAt && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markPaid.mutate(p.id)}
                                disabled={markPaid.isPending}
                              >
                                Mark paid
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
