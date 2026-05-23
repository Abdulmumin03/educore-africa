import type { UserRole } from "@prisma/client"

export const TRANSPORT_WRITE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
]

// Drivers post location updates; admins can also push for testing.
export const TRANSPORT_DRIVER_ROLES: UserRole[] = [
  ...TRANSPORT_WRITE_ROLES,
  "DRIVER",
]

/** Redis key for a route's most recent bus position. TTL 90s. */
export function busLocationKey(routeId: string): string {
  return `bus:route:${routeId}`
}

export const LIVE_TTL_SECONDS = 90
