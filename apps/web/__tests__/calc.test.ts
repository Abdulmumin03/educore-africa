import { describe, expect, it } from "vitest"
import { attendancePct, computeTotalScore, outstandingBalance } from "@/lib/calc"

describe("computeTotalScore", () => {
  it("adds CA + exam and rounds to 1 dp", () => {
    expect(computeTotalScore(28.5, 47.3)).toBe(75.8)
  })
  it("treats negatives as zero", () => {
    expect(computeTotalScore(-5, 50)).toBe(50)
    expect(computeTotalScore(40, -10)).toBe(40)
  })
  it("returns 0 for both-zero input", () => {
    expect(computeTotalScore(0, 0)).toBe(0)
  })
})

describe("attendancePct", () => {
  it("computes basic ratios", () => {
    expect(attendancePct(8, 10)).toBe(80)
    expect(attendancePct(40, 40)).toBe(100)
  })
  it("returns null when no data", () => {
    expect(attendancePct(0, 0)).toBeNull()
  })
  it("returns 0 for zero present with non-zero total", () => {
    expect(attendancePct(0, 10)).toBe(0)
  })
  it("clamps absurd inputs", () => {
    expect(attendancePct(-2, 10)).toBe(0)
    expect(attendancePct(20, 10)).toBe(100)
  })
})

describe("outstandingBalance", () => {
  it("returns billed minus paid", () => {
    expect(outstandingBalance(50_000, 30_000)).toBe(20_000)
  })
  it("clamps negative balances to zero", () => {
    expect(outstandingBalance(50_000, 60_000)).toBe(0)
  })
  it("returns zero when paid equals billed", () => {
    expect(outstandingBalance(75_000, 75_000)).toBe(0)
  })
})
