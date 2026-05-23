import { describe, expect, it } from "vitest"
import { isAnomaly, letterGradeFor, stdev, totalCaFrom } from "@/lib/grade-config"
import { DEFAULT_GRADING } from "@/lib/school-settings"

describe("letterGradeFor (WAEC-style default scale)", () => {
  const scale = DEFAULT_GRADING.scale

  it("returns A1 for top scores", () => {
    expect(letterGradeFor(100, scale)?.grade).toBe("A1")
    expect(letterGradeFor(75, scale)?.grade).toBe("A1")
  })
  it("returns F9 for failing scores", () => {
    expect(letterGradeFor(0, scale)?.grade).toBe("F9")
    expect(letterGradeFor(39, scale)?.grade).toBe("F9")
  })
  it("maps mid-range scores correctly", () => {
    expect(letterGradeFor(60, scale)?.grade).toBe("C4")
    expect(letterGradeFor(49, scale)?.grade).toBe("D7")
    expect(letterGradeFor(45, scale)?.grade).toBe("D7")
  })
  it("carries the band's remark", () => {
    expect(letterGradeFor(80, scale)?.remark).toBe("Excellent")
    expect(letterGradeFor(20, scale)?.remark).toBe("Fail")
  })
  it("returns null when no band matches", () => {
    expect(letterGradeFor(150, scale)).toBeNull()
    expect(letterGradeFor(-1, scale)).toBeNull()
  })
})

describe("totalCaFrom", () => {
  const components = ["CA1", "CA2", "Mid-Term", "Assignment"]

  it("sums known components", () => {
    expect(
      totalCaFrom({ CA1: 8, CA2: 7, "Mid-Term": 10, Assignment: 9 }, components),
    ).toBe(34)
  })
  it("treats missing components as 0", () => {
    expect(totalCaFrom({ CA1: 8 }, components)).toBe(8)
  })
  it("ignores non-numeric values", () => {
    // @ts-expect-error — testing the runtime guard for bad inputs
    expect(totalCaFrom({ CA1: "8", CA2: 7 }, components)).toBe(7)
  })
  it("returns 0 for null input", () => {
    expect(totalCaFrom(null, components)).toBe(0)
  })
})

describe("stdev / isAnomaly", () => {
  it("stdev returns 0 for n < 2", () => {
    expect(stdev([])).toBe(0)
    expect(stdev([42])).toBe(0)
  })
  it("stdev matches a hand-computed sample", () => {
    // population stdev of [2,4,4,4,5,5,7,9] is 2 (textbook example)
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
  })
  it("isAnomaly: small samples never flag", () => {
    expect(isAnomaly(99, [50, 50, 50])).toBe(false)
  })
  it("isAnomaly flags outliers past the threshold", () => {
    // 5 samples around 50, plus a 95 → 2+ sigma above mean
    expect(isAnomaly(95, [48, 50, 51, 49, 52])).toBe(true)
  })
  it("isAnomaly returns false when peers are identical", () => {
    expect(isAnomaly(80, [50, 50, 50, 50, 50])).toBe(false)
  })
})
