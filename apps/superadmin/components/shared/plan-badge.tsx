import { cn } from "@/lib/utils"

export type Plan = "STARTER" | "GROWTH" | "PROFESSIONAL" | "ENTERPRISE" | "GOVERNMENT"

// A neutral chip with a coloured dot rather than a saturated pill. In a table
// row the only strong colour should be *status*, which is what gets scanned —
// a second colourful badge beside it competes for the same attention. The dot
// hues match the plan segments in the subscription-mix chart.
const DOTS: Record<Plan, string> = {
  STARTER: "bg-plan-starter",
  GROWTH: "bg-plan-growth",
  PROFESSIONAL: "bg-plan-professional",
  ENTERPRISE: "bg-plan-enterprise",
  GOVERNMENT: "bg-plan-government",
}

const LABELS: Record<Plan, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  PROFESSIONAL: "Professional",
  ENTERPRISE: "Enterprise",
  GOVERNMENT: "Government",
}

export function PlanBadge({ plan, className }: { plan: Plan; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded border border-sa-border-em/70 bg-sa-raised px-2 text-caption font-medium text-sa-text/90",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-sm", DOTS[plan])} aria-hidden="true" />
      {LABELS[plan]}
    </span>
  )
}
