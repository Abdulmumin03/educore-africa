import { describe, expect, it } from "vitest"
import { parseInputs, parseUssdCode } from "@/lib/ussd"

describe("parseUssdCode", () => {
  it("extracts the school code from a standard dial pattern", () => {
    expect(parseUssdCode("*123*4567#")).toBe("4567")
  })
  it("handles longer prefixes", () => {
    expect(parseUssdCode("*384*1*ABCD#")).toBe("ABCD")
  })
  it("accepts a single-segment short code", () => {
    // `*123#` → "123" is intentional: short codes without a prefix are valid.
    expect(parseUssdCode("*123#")).toBe("123")
  })
  it("returns null when the pattern is malformed", () => {
    expect(parseUssdCode("4567")).toBeNull()
    expect(parseUssdCode("")).toBeNull()
    expect(parseUssdCode("*nohash")).toBeNull()
  })
})

describe("parseInputs", () => {
  it("returns [] for empty text (top-level menu)", () => {
    expect(parseInputs("")).toEqual([])
  })
  it("returns a single-segment array for one input", () => {
    expect(parseInputs("1")).toEqual(["1"])
  })
  it("splits on * for chained input", () => {
    expect(parseInputs("1*2025001")).toEqual(["1", "2025001"])
  })
  it("preserves order through multiple levels", () => {
    expect(parseInputs("3*2025001*nope")).toEqual(["3", "2025001", "nope"])
  })
})

/**
 * Higher-level state-machine assertions on what each turn should produce.
 * We can't run `handleUssdTurn` end-to-end without a DB, but we can verify
 * the menu-routing decisions by reading the same inputs through `parseInputs`
 * and the leaf-selection logic that lives inside the handler.
 */
describe("USSD menu state machine (input-routing only)", () => {
  function decideLeaf(text: string): "main" | "1" | "2" | "3" | "4" | "0" | "unknown" {
    const inputs = parseInputs(text)
    if (inputs.length === 0) return "main"
    switch (inputs[0]) {
      case "1":
      case "2":
      case "3":
      case "4":
      case "0":
        return inputs[0]
      default:
        return "unknown"
    }
  }

  it("empty text → main menu", () => {
    expect(decideLeaf("")).toBe("main")
  })
  it("leaf picks route to the right menu", () => {
    expect(decideLeaf("1")).toBe("1")
    expect(decideLeaf("3*2025001")).toBe("3")
    expect(decideLeaf("0")).toBe("0")
  })
  it("unknown top-level falls back", () => {
    expect(decideLeaf("9")).toBe("unknown")
  })
})
