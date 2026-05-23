"use client"

import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export const ANALYTICS_COLOURS = [
  "#0D2B5E",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#6366f1",
  "#14b8a6",
  "#a855f7",
  "#0891b2",
]

export function useAnalytics<T>(type: string, from: string, to: string) {
  return useQuery<T>({
    queryKey: ["analytics", type, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/${type}?from=${from}&to=${to}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })
}

export function SectionCard({
  title,
  hint,
  children,
  className,
}: {
  title: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card>
      <CardContent className={cn("space-y-2 p-4", className)}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

export function LoadingBlock() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </CardContent>
    </Card>
  )
}

export function EmptyBlock({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  )
}

/**
 * Colour scale for a heatmap cell on a 0–100 academic score. Low = red,
 * mid = amber, high = green. Returns a Tailwind class.
 */
export function heatColour(value: number): string {
  if (value >= 70) return "bg-emerald-200 text-emerald-900"
  if (value >= 50) return "bg-amber-100 text-amber-900"
  if (value >= 30) return "bg-orange-100 text-orange-900"
  return "bg-red-100 text-red-900"
}
