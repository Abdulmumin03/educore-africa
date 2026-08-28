import { NextResponse } from "next/server"
import type { PaymentChannel, TransactionStatus } from "@prisma/client"

import { listTransactions } from "@/lib/revenue"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const STATUSES = ["PENDING", "SUCCESSFUL", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]
const GATEWAYS = ["PAYSTACK", "FLUTTERWAVE", "REMITA", "BANK_TRANSFER", "CASH", "USSD", "MOBILE_MONEY", "POS", "CHEQUE"]

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const params = new URL(request.url).searchParams
  const status = params.get("status")
  const gateway = params.get("gateway")
  const from = params.get("from")
  const to = params.get("to")

  return NextResponse.json(
    await listTransactions({
      page: Number(params.get("page") ?? 1) || 1,
      limit: Number(params.get("limit") ?? 25) || 25,
      search: params.get("search")?.trim() || undefined,
      status: status && STATUSES.includes(status) ? (status as TransactionStatus) : undefined,
      gateway: gateway && GATEWAYS.includes(gateway) ? (gateway as PaymentChannel) : undefined,
      schoolId: params.get("schoolId") ?? undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(`${to.slice(0, 10)}T23:59:59Z`) : undefined,
    }),
  )
}
