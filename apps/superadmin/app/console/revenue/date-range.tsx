"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarDays } from "lucide-react"

import { cn } from "@/lib/utils"

const PRESETS = [
  { key: "mtd", label: "MTD" },
  { key: "qtd", label: "QTD" },
  { key: "ytd", label: "YTD" },
  { key: "12m", label: "Last 12 months" },
  { key: "custom", label: "Custom" },
]

export function DateRangePicker({ preset, from, to }: { preset: string; from?: string; to?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const set = React.useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (!value) next.delete(key)
        else next.set(key, value)
      }
      router.push(`${pathname}?${next.toString()}`)
    },
    [pathname, router, searchParams],
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-caption text-sa-dim">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        Range
      </span>

      <div className="flex items-center gap-1 rounded-md border border-sa-border bg-sa-surface p-0.5">
        {PRESETS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => set({ preset: option.key, ...(option.key === "custom" ? {} : { from: undefined, to: undefined }) })}
            className={cn(
              "inline-flex h-7 items-center rounded px-2.5 text-caption transition-colors",
              preset === option.key
                ? "bg-sa-raised font-medium text-sa-text"
                : "text-sa-muted hover:text-sa-text",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <span className="flex items-center gap-1.5">
          <input
            type="date"
            value={from ?? ""}
            onChange={(event) => set({ preset: "custom", from: event.target.value })}
            aria-label="From date"
            className="h-8 rounded-md border border-sa-border-em/60 bg-sa-surface px-2 font-mono text-caption text-sa-text focus:border-sa-blue focus:outline-none"
          />
          <span className="text-caption text-sa-dim">to</span>
          <input
            type="date"
            value={to ?? ""}
            onChange={(event) => set({ preset: "custom", to: event.target.value })}
            aria-label="To date"
            className="h-8 rounded-md border border-sa-border-em/60 bg-sa-surface px-2 font-mono text-caption text-sa-text focus:border-sa-blue focus:outline-none"
          />
        </span>
      )}
    </div>
  )
}
