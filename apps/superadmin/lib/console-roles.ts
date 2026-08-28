import type { SuperAdminRole } from "@prisma/client"

// The console's own roles, in the order they appear in pickers. Lives here
// rather than in a route file: Next.js route modules may only export handlers
// and its own config keys, so a shared constant needs its own home.
export const CONSOLE_ROLES: SuperAdminRole[] = [
  "SUPER_ADMIN",
  "BUSINESS_ADMIN",
  "FINANCE_ADMIN",
  "SALES_ADMIN",
  "SUPPORT_ADMIN",
  "ANALYTICS_ADMIN",
  "ENGINEERING_ADMIN",
]

export const CONSOLE_ROLE_LABEL: Record<SuperAdminRole, string> = {
  SUPER_ADMIN: "Super admin",
  BUSINESS_ADMIN: "Business",
  FINANCE_ADMIN: "Finance",
  SALES_ADMIN: "Sales",
  SUPPORT_ADMIN: "Support",
  ANALYTICS_ADMIN: "Analytics",
  ENGINEERING_ADMIN: "Engineering",
}
