import { afterEach, beforeEach, describe, expect, it } from "vitest"
import crypto from "node:crypto"
import { verifyWebhookSignature } from "@/lib/paystack"

const SECRET = "sk_test_unit-tests-only"

function sign(body: string, key: string): string {
  return crypto.createHmac("sha512", key).update(body).digest("hex")
}

describe("verifyWebhookSignature", () => {
  let prevKey: string | undefined

  beforeEach(() => {
    prevKey = process.env.PAYSTACK_SECRET_KEY
    process.env.PAYSTACK_SECRET_KEY = SECRET
  })

  afterEach(() => {
    if (prevKey === undefined) delete process.env.PAYSTACK_SECRET_KEY
    else process.env.PAYSTACK_SECRET_KEY = prevKey
  })

  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "abc" } })
    const sig = sign(body, SECRET)
    expect(verifyWebhookSignature(body, sig)).toBe(true)
  })

  it("rejects a tampered payload", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "abc" } })
    const sig = sign(body, SECRET)
    expect(verifyWebhookSignature(body + "tamper", sig)).toBe(false)
  })

  it("rejects a payload signed with the wrong key", () => {
    const body = JSON.stringify({ event: "charge.success" })
    const sig = sign(body, "different-key")
    expect(verifyWebhookSignature(body, sig)).toBe(false)
  })

  it("rejects when the signature header is missing", () => {
    const body = JSON.stringify({ event: "charge.success" })
    expect(verifyWebhookSignature(body, null)).toBe(false)
    expect(verifyWebhookSignature(body, "")).toBe(false)
  })

  it("rejects when the secret env var is unset", () => {
    delete process.env.PAYSTACK_SECRET_KEY
    const body = JSON.stringify({ event: "charge.success" })
    expect(verifyWebhookSignature(body, "anything")).toBe(false)
  })

  it("handles malformed hex without throwing", () => {
    const body = JSON.stringify({ event: "charge.success" })
    expect(() => verifyWebhookSignature(body, "not-hex")).not.toThrow()
    expect(verifyWebhookSignature(body, "not-hex")).toBe(false)
  })
})
