export const AUDIT_TABS = [
  { key: "trail", label: "Audit trail" },
  { key: "access", label: "Data access" },
  { key: "ndpr", label: "NDPR requests" },
  { key: "deletions", label: "Deletions" },
] as const

export type AuditTab = (typeof AUDIT_TABS)[number]["key"]
