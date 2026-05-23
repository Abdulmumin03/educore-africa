"use client"

import dayjs from "dayjs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import type { StudentDTO } from "@/components/dashboard/students/profile/types"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PAID: "secondary",
  PARTIAL: "default",
  PENDING: "outline",
  OVERDUE: "destructive",
  WAIVED: "secondary",
}

export function FinanceTab({ student }: { student: StudentDTO }) {
  const balance = student.feeBalance
  const lastInvoice = student.feeInvoices[0]
  const lastPayment = student.feeInvoices
    .flatMap((i) => i.payments)
    .sort((a, b) => +new Date(b.paidAt) - +new Date(a.paidAt))[0]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Outstanding balance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p
              className={
                balance > 0
                  ? "text-3xl font-bold text-destructive tabular-nums"
                  : "text-3xl font-bold text-emerald-600 tabular-nums"
              }
            >
              ₦{balance.toLocaleString()}
            </p>
            <Button
              disabled={balance === 0}
              onClick={() => toast.info("Payments module wired in P04 — Paystack initialize.")}
            >
              {balance === 0 ? "All settled" : "Pay now"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last invoice</CardTitle>
          </CardHeader>
          <CardContent>
            {lastInvoice ? (
              <>
                <p className="font-mono text-sm">{lastInvoice.invoiceNo}</p>
                <p className="text-xs text-muted-foreground">
                  ₦{lastInvoice.amountDue.toLocaleString()} · due {dayjs(lastInvoice.dueDate).format("D MMM YYYY")}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last payment</CardTitle>
          </CardHeader>
          <CardContent>
            {lastPayment ? (
              <>
                <p className="font-mono text-sm">₦{lastPayment.amount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  {lastPayment.channel.replace("_", " ").toLowerCase()} · {dayjs(lastPayment.paidAt).format("D MMM YYYY")}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No payments recorded.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice history</CardTitle>
        </CardHeader>
        <CardContent>
          {student.feeInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {student.feeInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoiceNo}</TableCell>
                    <TableCell>{inv.termType[0] + inv.termType.slice(1).toLowerCase()}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      ₦{inv.amountDue.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ₦{inv.amountPaid.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[inv.status] ?? "outline"}>{inv.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{dayjs(inv.dueDate).format("D MMM YYYY")}</TableCell>
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
