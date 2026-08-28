"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"

/** Map / table toggle. Kept in the URL so a shared link keeps the view. */
export function GeoView({ view }: { view: "map" | "table" }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function select(next: "map" | "table") {
    const query = new URLSearchParams(params.toString())
    query.set("tab", "geographic")
    query.set("view", next)
    router.replace(`${pathname}?${query.toString()}`, { scroll: false })
  }

  return (
    <div className="inline-flex overflow-hidden rounded-md border border-sa-border" role="group">
      {(["map", "table"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          onClick={() => select(option)}
          className={cn(
            "h-7 px-3 text-caption capitalize transition-colors",
            view === option ? "bg-sa-raised text-sa-text" : "text-sa-dim hover:text-sa-text",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
