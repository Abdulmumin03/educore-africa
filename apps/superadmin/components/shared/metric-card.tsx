import { ArrowDown, ArrowUp } from "lucide-react"

import { cn } from "@/lib/utils"

export type TrendDirection = "up" | "down" | "flat"

/**
 * Whether a rising number is good depends on the metric: MRR up is green,
 * churn up is red. `invert` flips the colouring without flipping the arrow —
 * the arrow always shows which way the number moved.
 */
function trendTone(direction: TrendDirection, invert: boolean) {
  if (direction === "flat") return "text-sa-dim"
  const good = invert ? direction === "down" : direction === "up"
  return good ? "text-sa-green" : "text-sa-red"
}

function Sparkline({ points, tone }: { points: number[]; tone: string }) {
  if (points.length < 2) return null

  const width = 60
  const height = 24
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1

  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * (width - 2) + 1
      const y = height - 2 - ((value - min) / span) * (height - 4)
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", tone)}
    >
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MetricCard({
  label,
  value,
  subLabel,
  trend,
  trendDirection,
  invertTrend = false,
  sparkline,
  className,
}: {
  label: string
  value: string | number
  subLabel?: string
  /** Percentage change, unsigned — the direction carries the sign. */
  trend?: number
  trendDirection?: TrendDirection
  /** Set on metrics where down is good (churn, failures, latency). */
  invertTrend?: boolean
  /** 8 points is the design spec; any length ≥ 2 renders. */
  sparkline?: number[]
  className?: string
}) {
  const direction = trendDirection ?? (trend === undefined ? undefined : trend >= 0 ? "up" : "down")
  const tone = direction ? trendTone(direction, invertTrend) : "text-sa-dim"
  const TrendIcon = direction === "down" ? ArrowDown : ArrowUp

  return (
    <div className={cn("rounded-lg border border-sa-border bg-sa-surface p-4", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-sa-dim">{label}</p>

      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="tabular text-metric text-sa-text">{value}</span>
        {sparkline && <Sparkline points={sparkline} tone={tone} />}
      </div>

      {(trend !== undefined || subLabel) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {trend !== undefined && direction && (
            <span className={cn("flex items-center gap-0.5 font-medium", tone)}>
              {direction !== "flat" && <TrendIcon className="h-3 w-3" aria-hidden="true" />}
              <span className="tabular text-body">{Math.abs(trend).toFixed(1)}%</span>
            </span>
          )}
          {subLabel && <span className="text-caption text-sa-dim">{subLabel}</span>}
        </div>
      )}
    </div>
  )
}
