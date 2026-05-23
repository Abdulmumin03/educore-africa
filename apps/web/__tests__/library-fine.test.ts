import { describe, expect, it } from "vitest"
import { computeFine, defaultLoanDays } from "@/lib/library-helpers"

const DAY = 24 * 60 * 60 * 1000

describe("computeFine", () => {
  it("returns 0 when returned on or before due date", () => {
    const due = new Date("2026-03-01T12:00:00Z")
    const ret = new Date("2026-03-01T11:59:00Z")
    expect(computeFine(due, ret, 50)).toBe(0)
  })
  it("charges by ceil(days) — even 1 second late costs a day", () => {
    const due = new Date("2026-03-01T12:00:00Z")
    const ret = new Date("2026-03-01T12:00:01Z")
    expect(computeFine(due, ret, 50)).toBe(50)
  })
  it("scales linearly across multiple late days", () => {
    const due = new Date("2026-03-01T00:00:00Z")
    const ret = new Date(due.getTime() + 7 * DAY)
    expect(computeFine(due, ret, 50)).toBe(350) // 7 × 50
  })
  it("returns 0 for a zero rate even if very late", () => {
    const due = new Date("2026-03-01T00:00:00Z")
    const ret = new Date(due.getTime() + 30 * DAY)
    expect(computeFine(due, ret, 0)).toBe(0)
  })
})

describe("defaultLoanDays", () => {
  it("is the conventional 14-day fortnight", () => {
    expect(defaultLoanDays()).toBe(14)
  })
})
