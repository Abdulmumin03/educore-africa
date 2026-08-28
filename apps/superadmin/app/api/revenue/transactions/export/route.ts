import type { PaymentChannel, TransactionStatus } from "@prisma/client"

import { auditLog } from "@/lib/audit"
import { excelResponse, type Row } from "@/lib/exports"
import { listTransactions } from "@/lib/revenue"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const MAX_ROWS = 5000

/** Excel of the current transaction filters — same query, no page limit. */
export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const params = new URL(request.url).searchParams
  const { rows, total } = await listTransactions({
    page: 1,
    limit: MAX_ROWS,
    search: params.get("search")?.trim() || undefined,
    status: (params.get("status") as TransactionStatus) || undefined,
    gateway: (params.get("gateway") as PaymentChannel) || undefined,
    schoolId: params.get("schoolId") ?? undefined,
    from: params.get("from") ? new Date(params.get("from")!) : undefined,
    to: params.get("to") ? new Date(`${params.get("to")!.slice(0, 10)}T23:59:59Z`) : undefined,
  })

  await auditLog({
    userId: guard.user.id,
    action: "revenue.transactions.export",
    target: "revenue:transactions",
    targetType: "payment",
    ipAddress: guard.ipAddress,
    details: { rows: rows.length, matched: total, filters: Object.fromEntries(params) },
  })

  const sheet: Row[] = rows.map((row) => ({
    Date: row.createdAt.slice(0, 10),
    School: row.school,
    Description: row.description,
    "Amount (NGN)": row.amount,
    Gateway: row.gateway,
    Reference: row.reference,
    "Gateway ref": row.gatewayRef ?? "",
    Status: row.status,
    "Refunded (NGN)": row.refunded,
    "Failure reason": row.failureReason ?? "",
    Attempts: row.attempts,
    "Paid at": row.paidAt?.slice(0, 19).replace("T", " ") ?? "",
  }))

  const stamp = new Date().toISOString().slice(0, 10)
  return excelResponse(sheet, `educore-transactions-${stamp}`)
}
