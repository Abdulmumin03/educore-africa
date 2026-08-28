import type { SuperAdminRole } from "@prisma/client"

// Read-only capability matrix — same approach as apps/web's lib/permissions:
// roles are a fixed list in code, not DB rows, so a compromised database
// can't grant itself console powers.

export type ConsoleSection =
  | "command-centre"
  | "schools"
  | "revenue"
  | "users"
  | "analytics"
  | "support"
  | "system"
  | "growth"
  | "config"
  | "audit"

const MATRIX: Record<SuperAdminRole, ConsoleSection[] | "*"> = {
  SUPER_ADMIN: "*",
  BUSINESS_ADMIN: [
    "command-centre",
    "schools",
    "revenue",
    "analytics",
    "growth",
    "support",
  ],
  FINANCE_ADMIN: ["command-centre", "revenue", "schools", "analytics"],
  SALES_ADMIN: ["command-centre", "growth", "schools", "analytics"],
  SUPPORT_ADMIN: ["command-centre", "support", "schools", "users"],
  ANALYTICS_ADMIN: ["command-centre", "analytics", "revenue", "growth"],
  ENGINEERING_ADMIN: ["command-centre", "system", "audit", "config", "schools"],
}

export function canAccess(role: SuperAdminRole, section: ConsoleSection): boolean {
  const allowed = MATRIX[role]
  return allowed === "*" || allowed.includes(section)
}

export function allowedSections(role: SuperAdminRole): ConsoleSection[] {
  const allowed = MATRIX[role]
  return allowed === "*"
    ? [
        "command-centre",
        "schools",
        "revenue",
        "users",
        "analytics",
        "support",
        "system",
        "growth",
        "config",
        "audit",
      ]
    : allowed
}
