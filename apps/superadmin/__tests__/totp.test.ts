import * as OTPAuth from "otpauth"
import { describe, expect, it } from "vitest"

import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp"

const EMAIL = "admin@educoreafrica.com"

function currentCode(secret: string, offsetSeconds = 0): string {
  const totp = new OTPAuth.TOTP({
    issuer: "EduCore Africa Console",
    label: EMAIL,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  })
  return totp.generate({ timestamp: Date.now() + offsetSeconds * 1000 })
}

describe("TOTP", () => {
  it("accepts the current code", () => {
    const secret = generateTotpSecret()
    expect(verifyTotp(EMAIL, secret, currentCode(secret))).toBe(true)
  })

  it("tolerates one step of clock skew in each direction", () => {
    const secret = generateTotpSecret()
    expect(verifyTotp(EMAIL, secret, currentCode(secret, -30))).toBe(true)
    expect(verifyTotp(EMAIL, secret, currentCode(secret, 30))).toBe(true)
  })

  it("rejects a code from further out", () => {
    const secret = generateTotpSecret()
    expect(verifyTotp(EMAIL, secret, currentCode(secret, 300))).toBe(false)
  })

  it("rejects a code generated from a different secret", () => {
    expect(verifyTotp(EMAIL, generateTotpSecret(), currentCode(generateTotpSecret()))).toBe(false)
  })

  it("rejects anything that is not six digits", () => {
    const secret = generateTotpSecret()
    expect(verifyTotp(EMAIL, secret, "12345")).toBe(false)
    expect(verifyTotp(EMAIL, secret, "abcdef")).toBe(false)
    expect(verifyTotp(EMAIL, secret, "")).toBe(false)
  })

  it("builds an otpauth URI an authenticator app can read", () => {
    const secret = generateTotpSecret()
    const uri = totpUri(EMAIL, secret)

    expect(uri.startsWith("otpauth://totp/")).toBe(true)
    expect(uri).toContain(`secret=${secret}`)
    expect(uri).toContain("digits=6")
    expect(uri).toContain("period=30")
  })
})
