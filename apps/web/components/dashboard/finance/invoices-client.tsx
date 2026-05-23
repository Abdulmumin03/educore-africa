"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Banknote, FileText, Loader2, Plus, Send, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type ClassOpt = { id: string; name: string }
type TermOpt = { id: string; type: string; sessionName: string; isCurrent: boolean; sessionIsCurrent: boolean }

type InvoiceRow = {
  id: string
  invoiceNo: string
  studentId: string
  admissionNumber: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  className: string | null
  sectionName: string | null
  termType: string
  sessionName: string
  subtotal: number
  discountAmount: number
  amountDue: number
  amountPaid: number
  balance: number
  status: string
  dueDate: string
}

type ListResponse = {
  items: InvoiceRow[]
  page: number
  total: number
  pages: number
  totals: { invoiced: number; collected: number; outstanding: number; count: number; byStatus: Record<string, number> }
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  PARTIAL: "secondary",
  PAID: "default",
  OVERDUE: "destructive",
  WAIVED: "secondary",
}

export function InvoicesClient({
  canWrite,
  classes,
  terms,
}: {
  canWrite: boolean
  classes: ClassOpt[]
  terms: TermOpt[]
}) {
  const qc = useQueryClient()
  const defaultTerm = terms.find((t) => t.isCurrent && t.sessionIsCurrent) ?? terms[0]
  const [termId, setTermId] = useState(defaultTerm?.id ?? "")
  const [classId, setClassId] = useState<string>("__all__")
  const [status, setStatus] = useState<string>("__all__")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [genOpen, setGenOpen] = useState(false)
  const [recordFor, setRecordFor] = useState<InvoiceRow | null>(null)

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("limit", "50")
    if (termId) p.set("termId", termId)
    if (classId !== "__all__") p.set("classId", classId)
    if (status !== "__all__") p.set("status", status)
    if (search.trim()) p.set("search", search.trim())
    return p.toString()
  }, [page, termId, classId, status, search])

  useEffect(() => setPage(1), [termId, classId, status, search])

  const list = useQuery<ListResponse>({
    queryKey: ["invoices", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/finance/invoices?${queryString}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    placeholderData: (prev) => prev,
  })

  function downloadPdf(inv: InvoiceRow) {
    window.open(`/api/finance/invoices/${inv.id}/pdf`, "_blank")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            {list.data ? `${list.data.totals.count.toLocaleString()} on record` : "Loading…"}
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setGenOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Generate invoices
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Invoiced" value={`₦${(list.data?.totals.invoiced ?? 0).toLocaleString()}`} />
        <Stat label="Collected" value={`₦${(list.data?.totals.collected ?? 0).toLocaleString()}`} accent="text-emerald-600" />
        <Stat label="Outstanding" value={`₦${(list.data?.totals.outstanding ?? 0).toLocaleString()}`} accent="text-amber-600" />
        <Stat label="Invoices" value={`${list.data?.totals.count ?? 0}`} />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <Field label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.sessionName} · {t.type[0] + t.type.slice(1).toLowerCase()}
                    {t.isCurrent ? " · current" : ""}
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
          <Field label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="PARTIAL">Partial</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="OVERDUE">Overdue</SelectItem>
                <SelectItem value="WAIVED">Waived</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Search">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, adm. no, invoice #"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading && !list.data ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Loading…
                  </TableCell>
                </TableRow>
              ) : list.data && list.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    No invoices match. {canWrite && <Button variant="link" onClick={() => setGenOpen(true)}>Generate some</Button>}
                  </TableCell>
                </TableRow>
              ) : (
                list.data?.items.map((inv) => {
                  const initials = (inv.firstName[0] ?? "") + (inv.lastName[0] ?? "")
                  return (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            {inv.avatarUrl ? <AvatarImage src={inv.avatarUrl} alt="" /> : null}
                            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                          </Avatar>
                          <span>
                            <span className="block text-sm font-medium">
                              {inv.firstName} {inv.lastName}
                            </span>
                            <span className="block font-mono text-[10px] text-muted-foreground">
                              {inv.admissionNumber}
                            </span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{inv.invoiceNo}</TableCell>
                      <TableCell className="text-xs">
                        {inv.className ? `${inv.className} · ${inv.sectionName}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        ₦{inv.amountDue.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        ₦{inv.amountPaid.toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono text-xs font-semibold tabular-nums",
                          inv.balance > 0 ? "text-amber-600" : "text-muted-foreground",
                        )}
                      >
                        ₦{inv.balance.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[inv.status] ?? "outline"} className="text-[10px]">
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => downloadPdf(inv)}>
                            <FileText className="mr-1 h-3 w-3" /> PDF
                          </Button>
                          {canWrite && inv.balance > 0 && (
                            <Button size="sm" variant="outline" onClick={() => setRecordFor(inv)}>
                              <Wallet className="mr-1 h-3 w-3" /> Record
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {list.data && list.data.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {list.data.page} of {list.data.pages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={list.data.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={list.data.page >= list.data.pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {genOpen && (
        <GenerateDialog
          classes={classes}
          terms={terms}
          defaultTermId={termId}
          onClose={() => setGenOpen(false)}
          onGenerated={() => {
            setGenOpen(false)
            qc.invalidateQueries({ queryKey: ["invoices", queryString] })
          }}
        />
      )}

      {recordFor && (
        <RecordPaymentDialog
          invoice={recordFor}
          onClose={() => setRecordFor(null)}
          onSaved={() => {
            setRecordFor(null)
            qc.invalidateQueries({ queryKey: ["invoices", queryString] })
          }}
        />
      )}
    </div>
  )
}

function GenerateDialog({
  classes,
  terms,
  defaultTermId,
  onClose,
  onGenerated,
}: {
  classes: ClassOpt[]
  terms: TermOpt[]
  defaultTermId: string
  onClose: () => void
  onGenerated: () => void
}) {
  const [termId, setTermId] = useState(defaultTermId)
  const [selected, setSelected] = useState<Set<string>>(new Set(classes.map((c) => c.id)))
  const [dueDate, setDueDate] = useState(dayjs().add(14, "day").format("YYYY-MM-DD"))
  const [notify, setNotify] = useState(true)

  const generate = useMutation({
    mutationFn: async () => {
      if (selected.size === 0) throw new Error("Pick at least one class")
      const res = await fetch("/api/finance/invoices/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          termId,
          classIds: Array.from(selected),
          dueDate,
          notify,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ created: number; skipped: number }>
    },
    onSuccess: (d) => {
      toast.success(`Generated ${d.created} invoice(s)${d.skipped > 0 ? `, skipped ${d.skipped}` : ""}`)
      onGenerated()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate invoices</DialogTitle>
          <DialogDescription>
            Creates one invoice per active student in the picked classes for the chosen term.
            Idempotent — students who already have a term invoice are skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label={`Classes (${selected.size}/${classes.length} selected)`}>
            <div className="flex flex-wrap gap-1.5">
              {classes.map((c) => {
                const sel = selected.has(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (next.has(c.id)) next.delete(c.id)
                        else next.add(c.id)
                        return next
                      })
                    }
                    className={cn(
                      "rounded border px-2 py-1 text-xs transition",
                      sel ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted",
                    )}
                  >
                    {c.name}
                  </button>
                )
              })}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="h-4 w-4"
            />
            <Send className="h-3.5 w-3.5" />
            SMS + email invoice to primary guardians
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={generate.isPending}>Cancel</Button>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RecordPaymentDialog({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: InvoiceRow
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState(String(invoice.balance))
  const [channel, setChannel] = useState("CASH")
  const [reference, setReference] = useState("")
  const [payerName, setPayerName] = useState("")
  const [payerPhone, setPayerPhone] = useState("")
  const [paidAt, setPaidAt] = useState(dayjs().format("YYYY-MM-DD"))
  const [notes, setNotes] = useState("")
  const [evidenceUrl, setEvidenceUrl] = useState("")

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payments/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: Number(amount),
          channel,
          reference,
          paidAt,
          payerName,
          payerPhone,
          notes,
          evidenceUrl,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ reference: string; paymentId?: string }>
    },
    onSuccess: (d) => {
      toast.success(`Payment recorded · ${d.reference}`)
      if (d.paymentId) {
        window.open(`/api/payments/${d.paymentId}/receipt`, "_blank")
      }
      onSaved()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Record payment · {invoice.firstName} {invoice.lastName}
          </DialogTitle>
          <DialogDescription>
            Invoice {invoice.invoiceNo} · balance ₦{invoice.balance.toLocaleString()}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (₦)">
            <Input
              type="number"
              min={1}
              max={invoice.balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Channel">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                <SelectItem value="POS">POS</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="USSD">USSD</SelectItem>
                <SelectItem value="MOBILE_MONEY">Mobile money</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Reference (optional)">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref / cheque #" />
          </Field>
          <Field label="Paid on">
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
          <Field label="Payer name">
            <Input value={payerName} onChange={(e) => setPayerName(e.target.value)} />
          </Field>
          <Field label="Payer phone">
            <Input value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} />
          </Field>
          <Field label="Evidence URL (optional)" className="sm:col-span-2">
            <Input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="https://… (upload elsewhere)" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !Number(amount)}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <Banknote className="mr-1.5 h-4 w-4" /> Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-bold tabular-nums", accent)}>{value}</p>
      </CardContent>
    </Card>
  )
}
