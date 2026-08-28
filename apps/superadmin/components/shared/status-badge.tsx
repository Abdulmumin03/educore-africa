import { cn } from "@/lib/utils"

// Mirrors the SubscriptionStatus enum. PAST_DUE arrived with the commercial
// layer — a school still using the product but behind on payment, which is a
// warning rather than a failure.
export type SchoolStatus = "ACTIVE" | "TRIAL" | "PAST_DUE" | "SUSPENDED" | "CHURNED"

// Colour is never the only signal: every badge also carries its word, and the
// three live states carry a dot. Churned is deliberately grey and dotless —
// it is an absence of state, not a state.
const STYLES: Record<SchoolStatus, { chip: string; dot: string | null; label: string }> = {
  ACTIVE: { chip: "bg-sa-green/15 text-sa-green", dot: "bg-sa-green", label: "Active" },
  TRIAL: { chip: "bg-sa-amber/15 text-sa-amber", dot: "bg-sa-amber", label: "Trial" },
  PAST_DUE: { chip: "bg-sa-amber/15 text-sa-amber", dot: "bg-sa-amber", label: "Past due" },
  SUSPENDED: { chip: "bg-sa-red/15 text-sa-red", dot: "bg-sa-red", label: "Suspended" },
  CHURNED: { chip: "bg-sa-dim/15 text-sa-dim", dot: null, label: "Churned" },
}

export function StatusBadge({
  status,
  className,
}: {
  status: SchoolStatus
  className?: string
}) {
  const style = STYLES[status]

  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded px-2 text-caption font-medium",
        style.chip,
        className,
      )}
    >
      {style.dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden="true" />
      )}
      {style.label}
    </span>
  )
}
