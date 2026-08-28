import { describe, expect, it } from "vitest"

import { MAX_ATTEMPTS, lockState, lockoutMessage } from "@/lib/lockout"

describe("lockState", () => {
  it("is unlocked with no failures", () => {
    expect(lockState({ failedLoginAttempts: 0, lockedUntil: null })).toEqual({
      locked: false,
      until: null,
      remaining: MAX_ATTEMPTS,
    })
  })

  it("counts down remaining attempts", () => {
    expect(lockState({ failedLoginAttempts: 3, lockedUntil: null }).remaining).toBe(2)
  })

  it("never reports negative attempts remaining", () => {
    expect(lockState({ failedLoginAttempts: 9, lockedUntil: null }).remaining).toBe(0)
  })

  it("is locked while lockedUntil is in the future", () => {
    const until = new Date(Date.now() + 10 * 60_000)
    const state = lockState({ failedLoginAttempts: MAX_ATTEMPTS, lockedUntil: until })
    expect(state.locked).toBe(true)
    expect(state.until).toEqual(until)
  })

  it("is unlocked once lockedUntil has passed", () => {
    const state = lockState({
      failedLoginAttempts: MAX_ATTEMPTS,
      lockedUntil: new Date(Date.now() - 1000),
    })
    expect(state.locked).toBe(false)
    expect(state.until).toBeNull()
  })
})

describe("lockoutMessage", () => {
  it("rounds up to whole minutes", () => {
    expect(lockoutMessage(new Date(Date.now() + 61_000))).toContain("2 minutes")
  })

  it("uses the singular for the last minute", () => {
    expect(lockoutMessage(new Date(Date.now() + 30_000))).toContain("1 minute.")
  })

  it("falls back to the policy window with no deadline", () => {
    expect(lockoutMessage(null)).toContain("15 minutes")
  })
})
