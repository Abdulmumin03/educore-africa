"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
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

type Year = { id: string; name: string; isCurrent: boolean; terms: { id: string; type: string; isCurrent: boolean }[] }
type ClassOpt = { id: string; name: string }

type Component = {
  id?: string
  name: string
  category: string
  amount: number
  isMandatory: boolean
  dueDate: string
}

type StructureResponse = {
  classes: Array<{
    classId: string
    className: string
    total: number
    components: Array<{
      id: string
      name: string
      category: string
      amount: number
      isMandatory: boolean
      dueDate: string | null
    }>
  }>
}

const CATEGORIES = [
  "TUITION",
  "LEVY",
  "UNIFORM",
  "BOOKS",
  "TRANSPORT",
  "HOSTEL",
  "EXAM",
  "PTA",
  "OTHER",
] as const

export function FeeStructureClient({
  classes,
  years,
}: {
  classes: ClassOpt[]
  years: Year[]
}) {
  const qc = useQueryClient()
  const defaultYear = years.find((y) => y.isCurrent) ?? years[0]
  const [yearId, setYearId] = useState(defaultYear?.id ?? "")
  const [termId, setTermId] = useState<string>(
    defaultYear?.terms.find((t) => t.isCurrent)?.id ?? "__year__",
  )
  const [classId, setClassId] = useState(classes[0]?.id ?? "")
  const [copyOpen, setCopyOpen] = useState(false)

  const year = years.find((y) => y.id === yearId)
  const terms = year?.terms ?? []

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    p.set("academicYearId", yearId)
    if (termId === "__year__") p.set("termId", "null")
    else if (termId) p.set("termId", termId)
    p.set("classId", classId)
    return p.toString()
  }, [yearId, termId, classId])

  const fetchStructure = useQuery<StructureResponse>({
    queryKey: ["fee-structure", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/finance/fee-structure?${queryString}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    enabled: !!yearId && !!classId,
  })

  const [components, setComponents] = useState<Component[]>([])
  useEffect(() => {
    const klass = fetchStructure.data?.classes.find((c) => c.classId === classId)
    setComponents(
      (klass?.components ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        amount: c.amount,
        isMandatory: c.isMandatory,
        dueDate: c.dueDate ? c.dueDate.slice(0, 10) : "",
      })),
    )
  }, [fetchStructure.data, classId])

  const total = components
    .filter((c) => c.isMandatory)
    .reduce((acc, c) => acc + (Number(c.amount) || 0), 0)

  function addRow() {
    setComponents((prev) => [
      ...prev,
      { name: "", category: "TUITION", amount: 0, isMandatory: true, dueDate: "" },
    ])
  }
  function updateRow(i: number, patch: Partial<Component>) {
    setComponents((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function removeRow(i: number) {
    setComponents((prev) => prev.filter((_, idx) => idx !== i))
  }

  const save = useMutation({
    mutationFn: async () => {
      const valid = components.filter((c) => c.name.trim().length > 0 && c.amount >= 0)
      if (valid.length === 0) throw new Error("Add at least one component")
      const res = await fetch("/api/finance/fee-structure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          academicYearId: yearId,
          termId: termId === "__year__" ? null : termId,
          classId,
          components: valid.map((c) => ({
            id: c.id,
            name: c.name.trim(),
            category: c.category,
            amount: Number(c.amount),
            isMandatory: c.isMandatory,
            dueDate: c.dueDate || undefined,
          })),
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success("Fee structure saved")
      qc.invalidateQueries({ queryKey: ["fee-structure", queryString] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fee structure</h1>
          <p className="text-sm text-muted-foreground">
            Configure fee components per class for a term (or the whole year).
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setCopyOpen(true)}>
            <Copy className="mr-1.5 h-4 w-4" />
            Copy from previous term
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <Field label="Academic year">
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.name}{y.isCurrent ? " · current" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__year__">Whole year (applies to every term)</SelectItem>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.type[0] + t.type.slice(1).toLowerCase()}{t.isCurrent ? " · current" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Class">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Components</CardTitle>
            <CardDescription>Each row is a line item on the invoice.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={addRow}>
            <Plus className="mr-1 h-3 w-3" /> Add component
          </Button>
        </CardHeader>
        <CardContent>
          {fetchStructure.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : components.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No components yet — add one.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-left">Category</th>
                    <th className="px-2 py-2 text-right">Amount (₦)</th>
                    <th className="px-2 py-2 text-center">Mandatory</th>
                    <th className="px-2 py-2 text-left">Due date</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {components.map((c, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-1.5">
                        <Input
                          value={c.name}
                          onChange={(e) => updateRow(i, { name: e.target.value })}
                          placeholder="Tuition Fee"
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Select value={c.category} onValueChange={(v) => updateRow(i, { category: v })}>
                          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min={0}
                          inputMode="decimal"
                          value={c.amount === 0 ? "" : c.amount}
                          onChange={(e) => updateRow(i, { amount: Number(e.target.value) || 0 })}
                          className="h-8 w-28 text-right text-xs tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={c.isMandatory}
                          onChange={(e) => updateRow(i, { isMandatory: e.target.checked })}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="date"
                          value={c.dueDate}
                          onChange={(e) => updateRow(i, { dueDate: e.target.value })}
                          className="h-8 w-36 text-xs"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Button variant="ghost" size="icon-sm" onClick={() => removeRow(i)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex justify-end gap-2 text-sm">
                <Badge variant="outline">Mandatory total: ₦{total.toLocaleString()}</Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {copyOpen && (
        <CopyDialog
          years={years}
          classes={classes}
          targetYearId={yearId}
          targetTermId={termId === "__year__" ? null : termId}
          targetClassId={classId}
          onClose={() => setCopyOpen(false)}
          onCopied={() => {
            setCopyOpen(false)
            qc.invalidateQueries({ queryKey: ["fee-structure", queryString] })
          }}
        />
      )}
    </div>
  )
}

function CopyDialog({
  years,
  classes,
  targetYearId,
  targetTermId,
  targetClassId,
  onClose,
  onCopied,
}: {
  years: Year[]
  classes: ClassOpt[]
  targetYearId: string
  targetTermId: string | null
  targetClassId: string
  onClose: () => void
  onCopied: () => void
}) {
  const [fromYearId, setFromYearId] = useState(years[0]?.id ?? "")
  const [fromTermId, setFromTermId] = useState<string>("__year__")
  const [fromClassId, setFromClassId] = useState(classes[0]?.id ?? "")
  const [adjustPercent, setAdjustPercent] = useState<string>("0")

  const fromYear = years.find((y) => y.id === fromYearId)
  const fromTerms = fromYear?.terms ?? []

  const copy = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/finance/fee-structure", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromAcademicYearId: fromYearId,
          fromTermId: fromTermId === "__year__" ? null : fromTermId,
          fromClassId,
          toAcademicYearId: targetYearId,
          toTermId: targetTermId,
          toClassId: targetClassId,
          adjustPercent: Number(adjustPercent) || 0,
        }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Failed")
      }
      return res.json() as Promise<{ copied: number }>
    },
    onSuccess: (d) => {
      toast.success(`Copied ${d.copied} component(s)`)
      onCopied()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy fee structure</DialogTitle>
          <DialogDescription>
            Replaces any existing components on the target with copies from the source.
            Optionally adjust every amount up or down by a percentage.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="From year">
            <Select value={fromYearId} onValueChange={(v) => { setFromYearId(v); setFromTermId("__year__") }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="From term">
            <Select value={fromTermId} onValueChange={setFromTermId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__year__">Whole year</SelectItem>
                {fromTerms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.type[0] + t.type.slice(1).toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="From class">
            <Select value={fromClassId} onValueChange={setFromClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Adjust %">
            <Input
              type="number"
              step={0.5}
              value={adjustPercent}
              onChange={(e) => setAdjustPercent(e.target.value)}
              placeholder="0 = same, 10 = +10%"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={copy.isPending}>Cancel</Button>
          <Button onClick={() => copy.mutate()} disabled={copy.isPending}>
            {copy.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Copy
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
