import type { SlaTimer } from "@/lib/support"
import { cn } from "@/lib/utils"

const DOT: Record<SlaTimer["state"], string> = {
  met: "bg-sa-green",
  ok: "bg-sa-green",
  "at-risk": "bg-sa-amber",
  breached: "bg-sa-red",
}

const TEXT: Record<SlaTimer["state"], string> = {
  met: "text-sa-green",
  ok: "text-sa-green",
  "at-risk": "text-sa-amber",
  breached: "text-sa-red",
}

/**
 * The live SLA clock.
 *
 * A dot alone would encode state in colour only, so the label always spells
 * out the remaining time (or how far past the target the ticket is).
 */
export function SlaChip({ sla, className }: { sla: SlaTimer; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-caption tabular-nums", TEXT[sla.state], className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[sla.state])} aria-hidden="true" />
      {sla.label}
    </span>
  )
}
