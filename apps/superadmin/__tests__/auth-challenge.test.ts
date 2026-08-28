import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { signChallenge, verifyChallenge } from "@/lib/auth-challenge"

const USER = "clv0000000000000000000000"

beforeEach(() => {
  vi.stubEnv("SUPERADMIN_SECRET", "test-secret-for-unit-tests")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("auth challenge", () => {
  it("round-trips a signed challenge", () => {
    const token = signChallenge(USER, "mfa")
    expect(verifyChallenge(token, "mfa")).toEqual({ userId: USER, purpose: "mfa" })
  })

  it("refuses a challenge issued for a different purpose", () => {
    // An enrolment challenge must not be replayable at the MFA gate.
    const enrol = signChallenge(USER, "enroll")
    expect(verifyChallenge(enrol, "mfa")).toBeNull()
    expect(verifyChallenge(enrol, "enroll")).not.toBeNull()
  })

  it("rejects a tampered payload", () => {
    const token = signChallenge(USER, "mfa")
    const [payload, signature] = token.split(".")
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: "someone-else", pur: "mfa", exp: Date.now() + 60_000 }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")

    expect(payload).not.toBe(forgedPayload)
    expect(verifyChallenge(`${forgedPayload}.${signature}`, "mfa")).toBeNull()
  })

  it("rejects a challenge signed with a different secret", () => {
    const token = signChallenge(USER, "mfa")
    vi.stubEnv("SUPERADMIN_SECRET", "another-secret")
    expect(verifyChallenge(token, "mfa")).toBeNull()
  })

  it("expires after 5 minutes", () => {
    vi.useFakeTimers()
    const token = signChallenge(USER, "mfa")

    vi.advanceTimersByTime(4 * 60_000)
    expect(verifyChallenge(token, "mfa")).not.toBeNull()

    vi.advanceTimersByTime(2 * 60_000)
    expect(verifyChallenge(token, "mfa")).toBeNull()
  })

  it("handles missing and malformed tokens", () => {
    expect(verifyChallenge(undefined, "mfa")).toBeNull()
    expect(verifyChallenge("", "mfa")).toBeNull()
    expect(verifyChallenge("not-a-token", "mfa")).toBeNull()
    expect(verifyChallenge("a.b.c", "mfa")).toBeNull()
  })
})
