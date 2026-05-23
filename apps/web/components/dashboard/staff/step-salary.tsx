"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { StaffSalaryInput } from "@/lib/staff-schemas"

type Line = { name: string; amount: number }

export function StepSalary({
  defaults,
  onSubmit,
  onBack,
}: {
  defaults?: StaffSalaryInput
  onSubmit: (v: StaffSalaryInput) => void
  onBack: () => void
}) {
  const [gradeLevel, setGradeLevel] = useState(defaults?.gradeLevel ?? "")
  const [basicSalary, setBasicSalary] = useState<string>(
    defaults?.basicSalary != null ? String(defaults.basicSalary) : "",
  )
  const [allowances, setAllowances] = useState<Line[]>(defaults?.allowances ?? [])
  const [deductions, setDeductions] = useState<Line[]>(defaults?.deductions ?? [])
  const [bankName, setBankName] = useState(defaults?.bankName ?? "")
  const [accountNumber, setAccountNumber] = useState(defaults?.accountNumber ?? "")
  const [accountName, setAccountName] = useState(defaults?.accountName ?? "")

  const basicNum = Number(basicSalary) || 0
  const totalAllowances = allowances.reduce((a, l) => a + (Number(l.amount) || 0), 0)
  const totalDeductions = deductions.reduce((a, l) => a + (Number(l.amount) || 0), 0)
  const gross = basicNum + totalAllowances
  const net = Math.max(0, gross - totalDeductions)

  function submit() {
    onSubmit({
      gradeLevel,
      basicSalary: basicSalary === "" ? undefined : Number(basicSalary),
      allowances: allowances.filter((l) => l.name && Number(l.amount) > 0),
      deductions: deductions.filter((l) => l.name && Number(l.amount) > 0),
      bankName,
      accountNumber,
      accountName,
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Grade level">
          <Input placeholder="e.g. GL-08" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} />
        </Field>
        <Field label="Basic salary (₦)">
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            value={basicSalary}
            onChange={(e) => setBasicSalary(e.target.value)}
          />
        </Field>
      </div>

      <LineEditor
        title="Allowances"
        helper="Add monthly allowances (e.g. transport, housing)."
        items={allowances}
        onChange={setAllowances}
      />
      <LineEditor
        title="Deductions"
        helper="Add monthly deductions (e.g. tax, pension, loans)."
        items={deductions}
        onChange={setDeductions}
      />

      <div className="rounded-md border bg-muted/30 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Gross</span>
          <span className="font-mono">₦{gross.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Deductions</span>
          <span className="font-mono">−₦{totalDeductions.toLocaleString()}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t pt-1">
          <span className="font-medium">Net take-home</span>
          <span className="font-mono text-base font-bold">₦{net.toLocaleString()}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Bank name">
          <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
        </Field>
        <Field label="Account number">
          <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
        </Field>
        <Field label="Account name">
          <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
        </Field>
      </div>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button type="button" onClick={submit}>
          Continue →
        </Button>
      </div>
    </div>
  )
}

function LineEditor({
  title,
  helper,
  items,
  onChange,
}: {
  title: string
  helper: string
  items: Line[]
  onChange: (next: Line[]) => void
}) {
  function set(i: number, patch: Partial<Line>) {
    onChange(items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function add() {
    onChange([...items, { name: "", amount: 0 }])
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{helper}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-3 w-3" /> Add row
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">None.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((l, i) => (
            <li key={i} className="grid grid-cols-[1fr_140px_36px] gap-2">
              <Input
                placeholder="Name (e.g. Transport)"
                value={l.name}
                onChange={(e) => set(i, { name: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="Amount"
                value={l.amount === 0 ? "" : l.amount}
                onChange={(e) => set(i, { amount: Number(e.target.value) || 0 })}
              />
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
