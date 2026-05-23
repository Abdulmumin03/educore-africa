"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Download, Loader2 } from "lucide-react"
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

type TermOpt = { id: string; type: string; sessionName: string; isCurrent: boolean; sessionIsCurrent: boolean }

type RevenueResponse = {
  summary: {
    invoices: number
    invoiced: number
    collected: number
    outstanding: number
    collectionRate: number | null
    paymentsCount: number
    paymentsAmount: number
  }
  byChannel: { channel: string; count: number; amount: number }[]
  perTerm: { termId: string; label: string; invoiced: number; collected: number; outstanding: number; invoices: number }[]
  perClass: { classId: string; className: string; invoiced: number; collected: number; outstanding: number; collectionRate: number | null; invoices: number }[]
}

const CHANNEL_COLORS: Record<string, string> = {
  PAYSTACK: "#0D2B5E",
  CASH: "#10b981",
  BANK_TRANSFER: "#f59e0b",
  POS: "#8b5cf6",
  CHEQUE: "#06b6d4",
  USSD: "#ec4899",
  MOBILE_MONEY: "#84cc16",
  FLUTTERWAVE: "#f97316",
  REMITA: "#6366f1",
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function FinanceReportsClient({ terms }: { terms: TermOpt[] }) {
  const defaultTerm = terms.find((t) => t.isCurrent && t.sessionIsCurrent) ?? terms[0]
  const [termId, setTermId] = useState<string>(defaultTerm?.id ?? "__all__")

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    if (termId !== "__all__") p.set("termId", termId)
    return p.toString()
  }, [termId])

  const { data, isLoading } = useQuery<RevenueResponse>({
    queryKey: ["revenue", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/finance/reports/revenue?${queryString}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  function exportPerClass() {
    if (!data) return
    const rows: (string | number)[][] = [
      ["Class", "Invoices", "Invoiced", "Collected", "Outstanding", "Collection %"],
      ...data.perClass.map((c) => [
        c.className,
        c.invoices,
        c.invoiced,
        c.collected,
        c.outstanding,
        c.collectionRate ?? 0,
      ]),
    ]
    downloadCsv(`finance-per-class-${termId}.csv`, rows)
  }

  function exportPerTerm() {
    if (!data) return
    const rows: (string | number)[][] = [
      ["Term", "Invoices", "Invoiced", "Collected", "Outstanding"],
      ...data.perTerm.map((t) => [t.label, t.invoices, t.invoiced, t.collected, t.outstanding]),
    ]
    downloadCsv(`finance-per-term.csv`, rows)
  }

  return (
    <div className="space-y-4 print:p-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold tracking-tight">Finance reports</h1>
        <p className="text-sm text-muted-foreground">
          Revenue summary, channel mix, term and class breakdowns. CSV export + print-friendly.
        </p>
      </div>

      <Card className="print:hidden">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <Field label="Term scope">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All terms (all-time)</SelectItem>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.sessionName} · {t.type[0] + t.type.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div />
          <div className="flex items-end justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const p = new URLSearchParams()
                if (termId !== "__all__") p.set("termId", termId)
                window.open(`/api/finance/reports/revenue/xlsx?${p}`, "_blank")
              }}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>Print</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Invoiced" value={`₦${data.summary.invoiced.toLocaleString()}`} />
            <Stat label="Collected" value={`₦${data.summary.collected.toLocaleString()}`} accent="text-emerald-600" />
            <Stat label="Outstanding" value={`₦${data.summary.outstanding.toLocaleString()}`} accent="text-amber-600" />
            <Stat
              label="Collection rate"
              value={data.summary.collectionRate === null ? "—" : `${data.summary.collectionRate}%`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Collection by channel</CardTitle>
                <CardDescription>Where the money came in via.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.byChannel.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments yet for this scope.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr]">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={data.byChannel}
                          dataKey="amount"
                          nameKey="channel"
                          innerRadius={40}
                          outerRadius={80}
                        >
                          {data.byChannel.map((c) => (
                            <Cell key={c.channel} fill={CHANNEL_COLORS[c.channel] ?? "#64748b"} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, _name, ctx) => {
                            const payload = ctx?.payload as { count?: number; channel?: string } | undefined
                            return [
                              `₦${Number(value ?? 0).toLocaleString()} (${payload?.count ?? 0})`,
                              String(payload?.channel ?? ""),
                            ]
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="space-y-1.5 text-sm">
                      {data.byChannel.map((c) => (
                        <li key={c.channel} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-sm"
                              style={{ backgroundColor: CHANNEL_COLORS[c.channel] ?? "#64748b" }}
                            />
                            {c.channel.replace("_", " ")}
                            <span className="text-xs text-muted-foreground">({c.count})</span>
                          </span>
                          <span className="font-mono font-semibold">₦{c.amount.toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">Term-over-term</CardTitle>
                  <CardDescription>Invoiced vs collected per term.</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={exportPerTerm} disabled={data.perTerm.length === 0}>
                  <Download className="mr-1.5 h-4 w-4" /> CSV
                </Button>
              </CardHeader>
              <CardContent>
                {data.perTerm.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No term data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.perTerm.slice().reverse()}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => `₦${Number(v ?? 0).toLocaleString()}`} />
                      <Bar dataKey="invoiced" fill="#0D2B5E" name="Invoiced" />
                      <Bar dataKey="collected" fill="#10b981" name="Collected" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Per-class breakdown</CardTitle>
                <CardDescription>Which classes are pulling weight.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={exportPerClass} disabled={data.perClass.length === 0}>
                <Download className="mr-1.5 h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent>
              {data.perClass.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices in this scope.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                      <TableHead className="text-right">Invoiced</TableHead>
                      <TableHead className="text-right">Collected</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-right">Collection %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.perClass.map((c) => (
                      <TableRow key={c.classId}>
                        <TableCell className="text-sm">{c.className}</TableCell>
                        <TableCell className="text-right text-xs">{c.invoices}</TableCell>
                        <TableCell className="text-right font-mono text-xs">₦{c.invoiced.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-emerald-700">
                          ₦{c.collected.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-amber-700">
                          ₦{c.outstanding.toLocaleString()}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs font-medium",
                            c.collectionRate === null
                              ? "text-muted-foreground"
                              : c.collectionRate >= 80
                                ? "text-emerald-600"
                                : c.collectionRate >= 50
                                  ? "text-amber-600"
                                  : "text-red-600",
                          )}
                        >
                          {c.collectionRate === null ? "—" : `${c.collectionRate}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
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
