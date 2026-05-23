"use client"

import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import { Download, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { StaffDTO } from "@/components/dashboard/staff/profile/types"

type Payslip = {
  id: string
  periodName: string
  periodStart: string
  periodEnd: string
  basicSalary: number
  allowances: { name: string; amount: number }[]
  deductions: { name: string; amount: number }[]
  gross: number
  net: number
  paidAt: string | null
  note: string | null
}
type Response = {
  structure: {
    basicSalary: number
    allowances: { name: string; amount: number }[]
    deductions: { name: string; amount: number }[]
    bank: { name: string; accountNumber: string | null; accountName: string | null } | null
  }
  items: Payslip[]
}

function downloadPayslip(staff: StaffDTO, p: Payslip) {
  // PDF is rendered server-side; open in a new tab so the browser handles
  // the download with the server's Content-Disposition header.
  window.open(`/api/staff/${staff.id}/payslips/${p.id}/pdf`, "_blank")
}

export function PayrollTab({ staffId, staff }: { staffId: string; staff: StaffDTO }) {
  const { data, isLoading } = useQuery<Response>({
    queryKey: ["staff-payslips", staffId],
    queryFn: async () => {
      const res = await fetch(`/api/staff/${staffId}/payslips`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading payroll…
      </div>
    )
  }

  const totalAllowances = data.structure.allowances.reduce((a, l) => a + l.amount, 0)
  const totalDeductions = data.structure.deductions.reduce((a, l) => a + l.amount, 0)
  const gross = data.structure.basicSalary + totalAllowances
  const net = Math.max(0, gross - totalDeductions)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Salary structure</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Basic salary</p>
            <p className="text-xl font-bold tabular-nums">
              ₦{data.structure.basicSalary.toLocaleString()}
            </p>
            <Earnings title="Allowances" rows={data.structure.allowances} />
            <Earnings title="Deductions" rows={data.structure.deductions} />
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-muted/40 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Gross</p>
                <p className="font-mono font-bold">₦{gross.toLocaleString()}</p>
              </div>
              <div className="rounded-md bg-emerald-500/10 p-2">
                <p className="text-[10px] uppercase text-emerald-700">Net take-home</p>
                <p className="font-mono font-bold text-emerald-700">₦{net.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Bank</p>
            {data.structure.bank ? (
              <div className="space-y-0.5 text-sm">
                <p className="font-medium">{data.structure.bank.name}</p>
                <p className="font-mono">{data.structure.bank.accountNumber ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {data.structure.bank.accountName ?? "—"}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No bank on file.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payslips</CardTitle>
        </CardHeader>
        <CardContent>
          {data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payslips yet — payroll runs will appear here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">
                      <span className="font-medium">{p.periodName}</span>
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        {dayjs(p.periodStart).format("D MMM")}–{dayjs(p.periodEnd).format("D MMM YYYY")}
                      </span>
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
                    <TableCell className="text-xs">
                      {p.paidAt ? (
                        <Badge variant="default">{dayjs(p.paidAt).format("D MMM")}</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => downloadPayslip(staff, p)}>
                        <Download className="mr-1 h-3 w-3" /> PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Earnings({
  title,
  rows,
}: {
  title: string
  rows: { name: string; amount: number }[]
}) {
  if (rows.length === 0) return null
  return (
    <div className="mt-3">
      <p className="text-xs uppercase text-muted-foreground">{title}</p>
      <ul className="text-sm">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center justify-between">
            <span>{r.name}</span>
            <span className="font-mono">₦{r.amount.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
