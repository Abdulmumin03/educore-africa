// Standard Nigerian class structure per tier. Used by the onboarding
// wizard to materialize Class + Section rows when a school goes live.

export type Tier = "NURSERY" | "PRIMARY" | "JSS" | "SSS"

export const CLASSES_BY_TIER: Record<Tier, { name: string; level: number }[]> = {
  NURSERY: [
    { name: "Nursery 1", level: 1 },
    { name: "Nursery 2", level: 2 },
    { name: "Nursery 3", level: 3 },
  ],
  PRIMARY: [
    { name: "Primary 1", level: 10 },
    { name: "Primary 2", level: 11 },
    { name: "Primary 3", level: 12 },
    { name: "Primary 4", level: 13 },
    { name: "Primary 5", level: 14 },
    { name: "Primary 6", level: 15 },
  ],
  JSS: [
    { name: "JSS 1", level: 20 },
    { name: "JSS 2", level: 21 },
    { name: "JSS 3", level: 22 },
  ],
  SSS: [
    { name: "SS 1", level: 30 },
    { name: "SS 2", level: 31 },
    { name: "SS 3", level: 32 },
  ],
}

export function armNames(count: number) {
  // A, B, ... Z. Wizard caps at 10 so we never overflow.
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i))
}

export function termDatesFor(sessionName: string) {
  // sessionName like "2025/2026" → returns 3 terms covering Sep→Jul.
  const [startYearStr, endYearStr] = sessionName.split("/")
  const startYear = Number(startYearStr)
  const endYear = Number(endYearStr)
  return {
    year: {
      startDate: new Date(Date.UTC(startYear, 8, 1)), // Sep 1
      endDate: new Date(Date.UTC(endYear, 6, 31)), // Jul 31
    },
    terms: [
      {
        type: "FIRST" as const,
        startDate: new Date(Date.UTC(startYear, 8, 1)),
        endDate: new Date(Date.UTC(startYear, 11, 20)),
      },
      {
        type: "SECOND" as const,
        startDate: new Date(Date.UTC(endYear, 0, 8)),
        endDate: new Date(Date.UTC(endYear, 3, 10)),
      },
      {
        type: "THIRD" as const,
        startDate: new Date(Date.UTC(endYear, 3, 25)),
        endDate: new Date(Date.UTC(endYear, 6, 31)),
      },
    ],
  }
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}
