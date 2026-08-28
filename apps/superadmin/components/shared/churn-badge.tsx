import { cn } from "@/lib/utils"

export type ChurnLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

// Colour is never the only signal — the badge always carries its word, and
// LOW is deliberately quiet so a directory of healthy schools does not look
// like a wall of alerts.
const STYLE: Record<ChurnLevel, { chip: string; label: string }> = {
  LOW: { chip: "bg-sa-dim/12 text-sa-dim", label: "Low" },
  MEDIUM: { chip: "bg-sa-blue/15 text-sa-blue", label: "Medium" },
  HIGH: { chip: "bg-sa-amber/15 text-sa-amber", label: "High" },
  CRITICAL: { chip: "bg-sa-red/15 text-sa-red", label: "Critical" },
}

export function ChurnBadge({
  level,
  score,
  className,
}: {
  level: ChurnLevel | null
  score?: number | null
  className?: string
}) {
  if (!level) {
    return (
      <span
        className={cn("text-caption text-sa-disabled", className)}
        title="This school has not been scored yet — run the weekly batch."
      >
        not scored
      </span>
    )
  }

  const style = STYLE[level]
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded px-2 text-caption font-medium",
        style.chip,
        className,
      )}
      title={score === null || score === undefined ? undefined : `Churn score ${score}/100`}
    >
      {style.label}
      {score !== null && score !== undefined && (
        <span className="font-mono tabular-nums opacity-75">{score}</span>
      )}
    </span>
  )
}
