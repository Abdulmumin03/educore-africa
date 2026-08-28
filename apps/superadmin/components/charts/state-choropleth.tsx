"use client"

import * as React from "react"

import { PLAN_LABEL, type PlanKey } from "@/lib/plans"
import { cn, formatCurrency, formatNumber } from "@/lib/utils"

export type StateDatum = {
  state: string
  schools: number
  mrr: number
  topPlan: PlanKey | null
}

// A tile-grid choropleth: one tile per state, positioned roughly
// geographically. Nigeria has 36 states plus the FCT, and at dashboard size a
// true polygon map renders most of them as unreadable slivers — the tile grid
// gives every state the same clickable area and needs no GeoJSON asset.
//
// (col, row) on a 7x7 grid, north-west at top-left.
const TILES: Array<{ code: string; state: string; col: number; row: number }> = [
  { code: "SOK", state: "Sokoto", col: 1, row: 1 },
  { code: "KTS", state: "Katsina", col: 2, row: 1 },
  { code: "JIG", state: "Jigawa", col: 3, row: 1 },
  { code: "YOB", state: "Yobe", col: 4, row: 1 },
  { code: "BOR", state: "Borno", col: 5, row: 1 },

  { code: "KEB", state: "Kebbi", col: 1, row: 2 },
  { code: "ZAM", state: "Zamfara", col: 2, row: 2 },
  { code: "KAN", state: "Kano", col: 3, row: 2 },
  { code: "BAU", state: "Bauchi", col: 4, row: 2 },
  { code: "GOM", state: "Gombe", col: 5, row: 2 },
  { code: "ADA", state: "Adamawa", col: 6, row: 2 },

  { code: "NIG", state: "Niger", col: 1, row: 3 },
  { code: "KAD", state: "Kaduna", col: 2, row: 3 },
  { code: "PLA", state: "Plateau", col: 3, row: 3 },
  { code: "TAR", state: "Taraba", col: 4, row: 3 },

  { code: "KWA", state: "Kwara", col: 1, row: 4 },
  { code: "FCT", state: "FCT", col: 2, row: 4 },
  { code: "NAS", state: "Nasarawa", col: 3, row: 4 },
  { code: "BEN", state: "Benue", col: 4, row: 4 },

  { code: "OYO", state: "Oyo", col: 1, row: 5 },
  { code: "OSU", state: "Osun", col: 2, row: 5 },
  { code: "EKI", state: "Ekiti", col: 3, row: 5 },
  { code: "KOG", state: "Kogi", col: 4, row: 5 },
  { code: "ENU", state: "Enugu", col: 5, row: 5 },
  { code: "EBO", state: "Ebonyi", col: 6, row: 5 },
  { code: "CRS", state: "Cross River", col: 7, row: 5 },

  { code: "OGN", state: "Ogun", col: 1, row: 6 },
  { code: "LAG", state: "Lagos", col: 2, row: 6 },
  { code: "OND", state: "Ondo", col: 3, row: 6 },
  { code: "EDO", state: "Edo", col: 4, row: 6 },
  { code: "ANA", state: "Anambra", col: 5, row: 6 },
  { code: "ABA", state: "Abia", col: 6, row: 6 },
  { code: "AKW", state: "Akwa Ibom", col: 7, row: 6 },

  { code: "DEL", state: "Delta", col: 3, row: 7 },
  { code: "BAY", state: "Bayelsa", col: 4, row: 7 },
  { code: "RIV", state: "Rivers", col: 5, row: 7 },
  { code: "IMO", state: "Imo", col: 6, row: 7 },
]

// Sequential single hue. On a dark surface the ramp runs near-background to
// bright blue, so "more" reads as brighter.
const RAMP = ["#14243A", "#1B3B5E", "#235489", "#2C6EB5", "#3B82F6", "#60A5FA"]

function bucket(count: number, max: number): number {
  if (count === 0) return 0
  if (max <= 5) return Math.min(RAMP.length - 1, count + 1)
  const ratio = count / max
  if (ratio <= 0.05) return 1
  if (ratio <= 0.15) return 2
  if (ratio <= 0.35) return 3
  if (ratio <= 0.65) return 4
  return 5
}

export function StateChoropleth({
  data,
  maxSchools,
}: {
  data: StateDatum[]
  maxSchools: number
}) {
  const [hovered, setHovered] = React.useState<StateDatum | null>(null)

  const byState = React.useMemo(() => {
    const map = new Map<string, StateDatum>()
    for (const row of data) map.set(row.state.trim().toLowerCase(), row)
    return map
  }, [data])

  const unplaced = React.useMemo(
    () =>
      data.filter(
        (row) =>
          row.schools > 0 &&
          !TILES.some((tile) => tile.state.toLowerCase() === row.state.trim().toLowerCase()),
      ),
    [data],
  )

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="relative shrink-0">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: "repeat(7, 38px)", gridAutoRows: "38px" }}
        >
          {TILES.map((tile) => {
            const datum = byState.get(tile.state.toLowerCase())
            const count = datum?.schools ?? 0
            const level = bucket(count, maxSchools)
            const bright = level >= 4

            return (
              <button
                key={tile.code}
                type="button"
                onMouseEnter={() =>
                  setHovered(datum ?? { state: tile.state, schools: 0, mrr: 0, topPlan: null })
                }
                onMouseLeave={() => setHovered(null)}
                onFocus={() =>
                  setHovered(datum ?? { state: tile.state, schools: 0, mrr: 0, topPlan: null })
                }
                onBlur={() => setHovered(null)}
                aria-label={`${tile.state}: ${count} school${count === 1 ? "" : "s"}`}
                className={cn(
                  "flex items-center justify-center rounded font-mono text-[10px] font-semibold transition-shadow",
                  bright ? "text-sa-base" : "text-sa-text/85",
                  count === 0 && "text-sa-disabled",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-sa-text",
                  hovered?.state === tile.state && "ring-2 ring-sa-text",
                )}
                style={{
                  gridColumn: tile.col,
                  gridRow: tile.row,
                  background: RAMP[level],
                  border: level === 0 ? "1px solid #1E3A5F" : undefined,
                }}
              >
                {tile.code}
              </button>
            )
          })}
        </div>

        {hovered && (
          <div className="pointer-events-none absolute left-0 top-full z-10 mt-2 w-52 rounded-lg border border-sa-border-em bg-sa-overlay p-3 shadow-xl">
            <p className="text-body font-semibold">{hovered.state}</p>
            <p className="mt-1.5 flex justify-between text-caption text-sa-muted">
              Schools <span className="tabular text-sa-text">{formatNumber(hovered.schools)}</span>
            </p>
            <p className="flex justify-between text-caption text-sa-muted">
              MRR <span className="tabular text-sa-text">{formatCurrency(hovered.mrr)}</span>
            </p>
            <p className="flex justify-between text-caption text-sa-muted">
              Top plan{" "}
              <span className="text-sa-text">
                {hovered.topPlan ? PLAN_LABEL[hovered.topPlan] : "—"}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-caption text-sa-dim">0</span>
          <span className="flex gap-0.5">
            {RAMP.map((colour) => (
              <span key={colour} className="h-2.5 w-6" style={{ background: colour }} />
            ))}
          </span>
          <span className="text-caption text-sa-dim">{formatNumber(maxSchools)}</span>
        </div>

        <ul className="space-y-1.5">
          {data.slice(0, 7).map((row) => (
            <li key={row.state} className="flex items-center gap-2.5 text-body">
              <span className="w-20 shrink-0 truncate">{row.state}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sa-base">
                <span
                  className="block h-full rounded-full bg-sa-blue"
                  style={{ width: `${maxSchools > 0 ? (row.schools / maxSchools) * 100 : 0}%` }}
                />
              </span>
              <span className="tabular w-9 shrink-0 text-right text-sa-muted">
                {formatNumber(row.schools)}
              </span>
            </li>
          ))}
        </ul>

        {unplaced.length > 0 && (
          <p className="text-caption text-sa-dim">
            {unplaced.length} location{unplaced.length === 1 ? "" : "s"} outside the Nigeria grid (
            {unplaced
              .slice(0, 3)
              .map((row) => row.state)
              .join(", ")}
            ) are counted in the totals but have no tile.
          </p>
        )}
      </div>
    </div>
  )
}
