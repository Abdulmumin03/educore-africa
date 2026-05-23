/**
 * Geofence math for the transport tracking pipe. All distances in metres.
 *
 * - `haversine` — great-circle distance between two lat/lng points.
 * - `crossTrackDistance` — perpendicular distance from a point to the
 *   geodesic line through two waypoints. Used for "is the bus on the route?"
 *   queries where the route is a polyline of stops.
 * - `pointToPolylineDistance` — min distance from a point to a polyline
 *   (segments between consecutive stops). Returns Infinity when fewer than
 *   2 georeferenced stops are available.
 */

const EARTH_RADIUS_M = 6_371_000

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_M * c
}

function initialBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lng2 - lng1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return Math.atan2(y, x)
}

/**
 * Cross-track distance (positive) from `p` to the great-circle segment AB.
 * If the projection falls outside the segment we fall back to the smaller of
 * the endpoint distances — this keeps the metric monotonic.
 */
export function crossTrackDistance(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const d13 = haversine(aLat, aLng, pLat, pLng) // A → P
  if (d13 === 0) return 0
  const θ13 = initialBearing(aLat, aLng, pLat, pLng)
  const θ12 = initialBearing(aLat, aLng, bLat, bLng)
  const dxt = Math.asin(Math.sin(d13 / EARTH_RADIUS_M) * Math.sin(θ13 - θ12))
  const ct = Math.abs(EARTH_RADIUS_M * dxt)

  // Along-track distance: how far along AB does the projection land?
  const dat =
    EARTH_RADIUS_M *
    Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          Math.cos(d13 / EARTH_RADIUS_M) / Math.cos(dxt),
        ),
      ),
    )
  const dab = haversine(aLat, aLng, bLat, bLng)

  // Projection lands outside the segment → use endpoint distance.
  if (dat < 0 || dat > dab) {
    const dPA = haversine(pLat, pLng, aLat, aLng)
    const dPB = haversine(pLat, pLng, bLat, bLng)
    return Math.min(dPA, dPB)
  }
  return ct
}

export type Geopoint = { lat: number; lng: number }

export function pointToPolylineDistance(
  p: Geopoint,
  polyline: Geopoint[],
): number {
  if (polyline.length < 1) return Infinity
  if (polyline.length === 1) return haversine(p.lat, p.lng, polyline[0].lat, polyline[0].lng)
  let min = Infinity
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = crossTrackDistance(
      p.lat,
      p.lng,
      polyline[i].lat,
      polyline[i].lng,
      polyline[i + 1].lat,
      polyline[i + 1].lng,
    )
    if (d < min) min = d
  }
  return min
}
