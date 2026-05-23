import { describe, expect, it } from "vitest"
import {
  crossTrackDistance,
  haversine,
  pointToPolylineDistance,
} from "@/lib/geofence"

// Lagos area reference points (precise enough for these assertions).
const LEKKI_PHASE_1: [number, number] = [6.4474, 3.4733]
const VICTORIA_ISLAND: [number, number] = [6.4281, 3.4218]
const IKOYI: [number, number] = [6.4509, 3.4347]
const APAPA: [number, number] = [6.4474, 3.3603]

function nearly(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

describe("haversine", () => {
  it("returns 0 for the same point", () => {
    expect(haversine(6.5, 3.4, 6.5, 3.4)).toBe(0)
  })
  it("computes Lekki ↔ VI as ~7 km", () => {
    const m = haversine(
      LEKKI_PHASE_1[0],
      LEKKI_PHASE_1[1],
      VICTORIA_ISLAND[0],
      VICTORIA_ISLAND[1],
    )
    nearly(m / 1000, 7, 1)
  })
  it("is commutative", () => {
    const a = haversine(6.5, 3.4, 6.6, 3.5)
    const b = haversine(6.6, 3.5, 6.5, 3.4)
    expect(a).toBe(b)
  })
})

describe("crossTrackDistance", () => {
  it("returns 0 when the point sits on the path", () => {
    // Midpoint of Lekki-VI is on the line segment between them.
    const midLat = (LEKKI_PHASE_1[0] + VICTORIA_ISLAND[0]) / 2
    const midLng = (LEKKI_PHASE_1[1] + VICTORIA_ISLAND[1]) / 2
    const d = crossTrackDistance(
      midLat,
      midLng,
      LEKKI_PHASE_1[0],
      LEKKI_PHASE_1[1],
      VICTORIA_ISLAND[0],
      VICTORIA_ISLAND[1],
    )
    expect(d).toBeLessThan(50) // < 50 metres of slack
  })
  it("falls back to endpoint distance when projection falls outside the segment", () => {
    // Point ~7 km north of VI; the LekkI→VI segment doesn't extend that way.
    const d = crossTrackDistance(
      6.5,
      3.4218,
      LEKKI_PHASE_1[0],
      LEKKI_PHASE_1[1],
      VICTORIA_ISLAND[0],
      VICTORIA_ISLAND[1],
    )
    // Should be at least the distance to the nearer endpoint, not 0.
    expect(d).toBeGreaterThan(1_000)
  })
})

describe("pointToPolylineDistance", () => {
  const route = [
    { lat: LEKKI_PHASE_1[0], lng: LEKKI_PHASE_1[1] },
    { lat: VICTORIA_ISLAND[0], lng: VICTORIA_ISLAND[1] },
    { lat: IKOYI[0], lng: IKOYI[1] },
  ]

  it("returns Infinity for an empty polyline", () => {
    expect(pointToPolylineDistance({ lat: 6.5, lng: 3.4 }, [])).toBe(Infinity)
  })
  it("returns Haversine distance for a single-point polyline", () => {
    const d = pointToPolylineDistance({ lat: 6.5, lng: 3.4 }, [{ lat: 6.5, lng: 3.4 }])
    expect(d).toBe(0)
  })
  it("picks the closest segment for a point near the route", () => {
    // Right next to VI — should be ~0 m from the polyline.
    const d = pointToPolylineDistance(
      { lat: VICTORIA_ISLAND[0] + 0.0005, lng: VICTORIA_ISLAND[1] + 0.0005 },
      route,
    )
    expect(d).toBeLessThan(150)
  })
  it("returns a large distance for a deviated point", () => {
    // Apapa is well off the Lekki–VI–Ikoyi axis.
    const d = pointToPolylineDistance(
      { lat: APAPA[0], lng: APAPA[1] },
      route,
    )
    expect(d).toBeGreaterThan(3_000)
  })
})
