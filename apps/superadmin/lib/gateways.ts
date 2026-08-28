import type { PaymentChannel } from "@prisma/client"

// Payment-gateway boundary for refunds and retries.
//
// A refund moves real money. This adapter therefore does NOT call a gateway
// unless it is explicitly switched on: set REFUNDS_LIVE=true *and* provide the
// relevant secret key. Otherwise a refund is recorded in our own ledger and
// flagged `gatewaySent: false`, so nobody can mistake a bookkeeping entry for
// a settled transfer.
//
// This is deliberate. A console that silently no-ops a refund is worse than
// one that refuses: finance would reconcile against a refund that never left.

export type GatewayResult =
  | { ok: true; sent: true; gatewayRef: string }
  | { ok: true; sent: false; reason: string }
  | { ok: false; sent: false; error: string }

export function isLive(): boolean {
  return process.env.REFUNDS_LIVE === "true"
}

function keyFor(gateway: PaymentChannel): string | undefined {
  switch (gateway) {
    case "PAYSTACK":
      return process.env.PAYSTACK_SECRET_KEY
    case "FLUTTERWAVE":
      return process.env.FLUTTERWAVE_SECRET_KEY
    default:
      return undefined
  }
}

/** Gateways that can be refunded through an API at all. */
export function supportsApiRefund(gateway: PaymentChannel): boolean {
  return gateway === "PAYSTACK" || gateway === "FLUTTERWAVE"
}

export function refundMode(gateway: PaymentChannel): {
  live: boolean
  reason: string
} {
  if (!supportsApiRefund(gateway)) {
    return { live: false, reason: `${gateway.toLowerCase()} refunds are handled manually` }
  }
  if (!isLive()) {
    return { live: false, reason: "REFUNDS_LIVE is not set — recorded in the ledger only" }
  }
  if (!keyFor(gateway)) {
    return { live: false, reason: `no ${gateway.toLowerCase()} secret key configured` }
  }
  return { live: true, reason: "" }
}

/**
 * Ask the gateway to refund a settled charge.
 *
 * Returns `sent: false` — without erroring — whenever the adapter is not live.
 * The caller records the refund either way and surfaces the distinction.
 */
export async function requestRefund(opts: {
  gateway: PaymentChannel
  gatewayRef: string | null
  amountKobo: number
  reason: string
}): Promise<GatewayResult> {
  const mode = refundMode(opts.gateway)
  if (!mode.live) return { ok: true, sent: false, reason: mode.reason }

  if (!opts.gatewayRef) {
    return { ok: false, sent: false, error: "The original charge has no gateway reference." }
  }

  try {
    if (opts.gateway === "PAYSTACK") {
      const response = await fetch("https://api.paystack.co/refund", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keyFor("PAYSTACK")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transaction: opts.gatewayRef,
          amount: opts.amountKobo,
          merchant_note: opts.reason.slice(0, 200),
        }),
      })
      const payload = (await response.json()) as {
        status?: boolean
        message?: string
        data?: { id?: number | string }
      }
      if (!response.ok || payload.status === false) {
        return { ok: false, sent: false, error: payload.message ?? `Paystack returned ${response.status}` }
      }
      return { ok: true, sent: true, gatewayRef: String(payload.data?.id ?? opts.gatewayRef) }
    }

    // Flutterwave keys the refund off its own transaction id.
    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(opts.gatewayRef)}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keyFor("FLUTTERWAVE")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: opts.amountKobo / 100 }),
      },
    )
    const payload = (await response.json()) as {
      status?: string
      message?: string
      data?: { id?: number | string }
    }
    if (!response.ok || payload.status === "error") {
      return { ok: false, sent: false, error: payload.message ?? `Flutterwave returned ${response.status}` }
    }
    return { ok: true, sent: true, gatewayRef: String(payload.data?.id ?? opts.gatewayRef) }
  } catch (error) {
    return { ok: false, sent: false, error: error instanceof Error ? error.message : "Gateway unreachable" }
  }
}

/** Deep link into the gateway's own dashboard for a charge. */
export function gatewayDashboardUrl(gateway: PaymentChannel, gatewayRef: string | null): string | null {
  if (!gatewayRef) return null
  switch (gateway) {
    case "PAYSTACK":
      return `https://dashboard.paystack.com/#/transactions/${encodeURIComponent(gatewayRef)}`
    case "FLUTTERWAVE":
      return `https://app.flutterwave.com/dashboard/transactions/${encodeURIComponent(gatewayRef)}`
    default:
      return null
  }
}
