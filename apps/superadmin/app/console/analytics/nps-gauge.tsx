import { cn } from "@/lib/utils"

/**
 * NPS runs −100 to +100, so a half-circle gauge with the needle swept across
 * that whole span — not 0-100, which would put a perfectly respectable +30 in
 * the bottom third and read as failure.
 */
export function NpsGauge({
  score,
  label,
  size = 180,
}: {
  score: number | null
  label?: string
  size?: number
}) {
  const radius = size / 2 - 12
  const centreX = size / 2
  const centreY = size / 2

  const BANDS = [
    { from: -100, to: 0, colour: "#DC2626" },
    { from: 0, to: 30, colour: "#D97706" },
    { from: 30, to: 70, colour: "#65A30D" },
    { from: 70, to: 100, colour: "#0D9488" },
  ]

  function point(value: number, r: number) {
    // −100 sits at 180°, +100 at 0°.
    const angle = Math.PI * (1 - (value + 100) / 200)
    return { x: centreX + r * Math.cos(angle), y: centreY - r * Math.sin(angle) }
  }

  function arc(from: number, to: number, r: number) {
    const start = point(from, r)
    const end = point(to, r)
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
  }

  const needle = score === null ? null : point(Math.max(-100, Math.min(100, score)), radius - 6)

  const tone =
    score === null
      ? "text-sa-disabled"
      : score >= 50
        ? "text-sa-teal"
        : score >= 30
          ? "text-sa-green"
          : score >= 0
            ? "text-sa-amber"
            : "text-sa-red"

  return (
    <figure className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 22} viewBox={`0 0 ${size} ${size / 2 + 22}`} role="img"
        aria-label={score === null ? `${label ?? "NPS"}: no responses` : `${label ?? "NPS"}: ${score.toFixed(0)}`}>
        {BANDS.map((band) => (
          <path
            key={band.from}
            d={arc(band.from, band.to, radius)}
            stroke={band.colour}
            strokeWidth={10}
            strokeLinecap="butt"
            fill="none"
            // 2px of surface between adjacent bands so they read as separate.
            opacity={0.9}
          />
        ))}

        {needle && (
          <>
            <line
              x1={centreX}
              y1={centreY}
              x2={needle.x}
              y2={needle.y}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="text-sa-text"
            />
            <circle cx={centreX} cy={centreY} r={4} className="fill-sa-text" />
          </>
        )}

        <text
          x={12}
          y={centreY + 18}
          className="fill-sa-disabled font-mono text-[10px]"
          textAnchor="start"
        >
          −100
        </text>
        <text
          x={size - 12}
          y={centreY + 18}
          className="fill-sa-disabled font-mono text-[10px]"
          textAnchor="end"
        >
          +100
        </text>
      </svg>

      <figcaption className="-mt-1 text-center">
        <span className={cn("font-mono text-display tabular-nums", tone)}>
          {score === null ? "—" : `${score > 0 ? "+" : ""}${score.toFixed(0)}`}
        </span>
        {label && <p className="text-caption text-sa-dim">{label}</p>}
      </figcaption>
    </figure>
  )
}
