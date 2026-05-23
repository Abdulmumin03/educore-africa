import crypto from "node:crypto"

const BASE = "https://api.paystack.co"

export type PaystackInitArgs = {
  email: string
  amount: number // in NGN
  reference?: string
  callbackUrl?: string
  metadata?: Record<string, unknown>
}

export type PaystackInitResponse = {
  authorization_url: string
  access_code: string
  reference: string
}

export async function initializePaystack(
  args: PaystackInitArgs,
): Promise<{ ok: true; data: PaystackInitResponse } | { ok: false; error: string }> {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return { ok: false, error: "PAYSTACK_SECRET_KEY not set" }
  }
  try {
    const res = await fetch(`${BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: args.email,
        amount: Math.round(args.amount * 100), // Paystack expects kobo
        reference: args.reference,
        callback_url: args.callbackUrl,
        metadata: args.metadata ?? {},
      }),
    })
    const json = (await res.json()) as
      | { status: true; data: PaystackInitResponse }
      | { status: false; message: string }
    if (!res.ok || !("status" in json) || !json.status) {
      return { ok: false, error: "message" in json ? json.message : "Paystack init failed" }
    }
    return { ok: true, data: json.data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" }
  }
}

export async function verifyPaystack(reference: string): Promise<
  | {
      ok: true
      data: {
        reference: string
        amount: number // kobo
        status: string
        channel: string
        paid_at: string
        customer: { email: string; first_name?: string; last_name?: string; phone?: string }
        metadata: Record<string, unknown> | null
      }
    }
  | { ok: false; error: string }
> {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return { ok: false, error: "PAYSTACK_SECRET_KEY not set" }
  }
  try {
    const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    })
    const json = (await res.json()) as
      | { status: true; data: { reference: string; amount: number; status: string; channel: string; paid_at: string; customer: { email: string; first_name?: string; last_name?: string; phone?: string }; metadata: Record<string, unknown> | null } }
      | { status: false; message: string }
    if (!res.ok || !("status" in json) || !json.status) {
      return { ok: false, error: "message" in json ? json.message : "Paystack verify failed" }
    }
    return { ok: true, data: json.data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" }
  }
}

/**
 * HMAC verification for Paystack webhooks. The header `x-paystack-signature`
 * is `sha512(rawBody, PAYSTACK_SECRET_KEY)`.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false
  const expected = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex")
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"))
  } catch {
    return false
  }
}
