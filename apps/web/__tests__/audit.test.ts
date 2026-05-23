import { describe, expect, it } from "vitest"
import { auditDiff, snapshot } from "@/lib/audit-utils"

describe("auditDiff", () => {
  it("returns null when both sides are missing", () => {
    expect(auditDiff(null, null)).toBeNull()
  })
  it("flags every field as a new addition when only `after` is set", () => {
    const diff = auditDiff(null, { status: "APPROVED", reason: "ok" })
    expect(diff).toEqual({
      status: { old: null, new: "APPROVED" },
      reason: { old: null, new: "ok" },
    })
  })
  it("flags every field as a removal when only `before` is set", () => {
    const diff = auditDiff({ status: "PENDING" }, null)
    expect(diff).toEqual({ status: { old: "PENDING", new: null } })
  })
  it("only includes changed fields", () => {
    const diff = auditDiff(
      { status: "PENDING", title: "Same" },
      { status: "APPROVED", title: "Same" },
    )
    expect(diff).toEqual({ status: { old: "PENDING", new: "APPROVED" } })
  })
  it("returns null when before == after", () => {
    expect(auditDiff({ a: 1, b: 2 }, { a: 1, b: 2 })).toBeNull()
  })
  it("treats deep structural changes as a change", () => {
    const diff = auditDiff({ items: [1, 2, 3] }, { items: [1, 2, 4] })
    expect(diff).not.toBeNull()
    expect(diff!.items.old).toEqual([1, 2, 3])
    expect(diff!.items.new).toEqual([1, 2, 4])
  })
})

describe("snapshot", () => {
  it("picks only the named fields", () => {
    const s = snapshot(
      { a: 1, b: 2, c: 3, createdAt: new Date(), updatedAt: new Date() },
      ["a", "c"] as const,
    )
    expect(s).toEqual({ a: 1, c: 3 })
  })
  it("returns null for a missing record", () => {
    expect(snapshot(null, ["a"] as const)).toBeNull()
  })
})
