import { afterEach, describe, expect, it, vi } from "vitest"

import { isGlobalBypass, isIpAllowed } from "@/lib/ip"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("isIpAllowed", () => {
  it("matches exact addresses", () => {
    expect(isIpAllowed("102.89.1.4", ["102.89.1.4"])).toBe(true)
    expect(isIpAllowed("102.89.1.5", ["102.89.1.4"])).toBe(false)
  })

  it("matches dotted prefixes", () => {
    expect(isIpAllowed("102.89.44.7", ["102.89."])).toBe(true)
    expect(isIpAllowed("41.58.1.1", ["102.89."])).toBe(false)
  })

  it("allows everything when the list is a wildcard", () => {
    expect(isIpAllowed("41.58.1.1", ["*"])).toBe(true)
  })

  it("fails open in development but closed in production when unset", () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(isIpAllowed("1.2.3.4", [])).toBe(true)

    vi.stubEnv("NODE_ENV", "production")
    expect(isIpAllowed("1.2.3.4", [])).toBe(false)
  })
})

describe("isGlobalBypass", () => {
  it("is on only when ALLOWED_IPS contains *", () => {
    vi.stubEnv("ALLOWED_IPS", "*")
    expect(isGlobalBypass()).toBe(true)

    vi.stubEnv("ALLOWED_IPS", "102.89.1.4")
    expect(isGlobalBypass()).toBe(false)

    vi.stubEnv("ALLOWED_IPS", "")
    expect(isGlobalBypass()).toBe(false)
  })
})
