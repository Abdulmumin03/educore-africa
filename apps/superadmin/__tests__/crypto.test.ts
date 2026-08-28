import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { decryptSecret, encryptSecret, isEncrypted, sha256 } from "@/lib/crypto"

beforeEach(() => {
  vi.stubEnv("SUPERADMIN_SECRET", "test-secret-for-unit-tests")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a TOTP seed", () => {
    const seed = "JBSWY3DPEHPK3PXP"
    const encrypted = encryptSecret(seed)

    expect(encrypted).not.toContain(seed)
    expect(isEncrypted(encrypted)).toBe(true)
    expect(decryptSecret(encrypted)).toBe(seed)
  })

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("JBSWY3DPEHPK3PXP")).not.toBe(encryptSecret("JBSWY3DPEHPK3PXP"))
  })

  it("passes through pre-SA-01 plaintext seeds unchanged", () => {
    expect(decryptSecret("JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP")
    expect(isEncrypted("JBSWY3DPEHPK3PXP")).toBe(false)
  })

  it("returns null for tampered ciphertext rather than garbage", () => {
    const encrypted = encryptSecret("JBSWY3DPEHPK3PXP")
    const tampered = `${encrypted.slice(0, -4)}AAAA`
    expect(decryptSecret(tampered)).toBeNull()
  })

  it("returns null when the key has changed", () => {
    const encrypted = encryptSecret("JBSWY3DPEHPK3PXP")
    vi.stubEnv("SUPERADMIN_SECRET", "a-completely-different-secret")
    expect(decryptSecret(encrypted)).toBeNull()
  })

  it("handles null and undefined", () => {
    expect(decryptSecret(null)).toBeNull()
    expect(decryptSecret(undefined)).toBeNull()
  })

  it("hashes deterministically", () => {
    expect(sha256("abc")).toBe(sha256("abc"))
    expect(sha256("abc")).not.toBe(sha256("abd"))
  })
})
