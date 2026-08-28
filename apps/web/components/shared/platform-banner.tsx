"use client"

import * as React from "react"
import { AlertTriangle, Info, Wrench, X } from "lucide-react"

import { cn } from "@/lib/utils"

export type PlatformNotice = {
  id: string
  title: string
  body: string
  type: "INFO" | "WARNING" | "MAINTENANCE"
  dismissible: boolean
}

const STYLE: Record<PlatformNotice["type"], { wrap: string; icon: string; Icon: typeof Info }> = {
  INFO: {
    wrap: "border-navy/15 bg-navy/[0.04] text-navy",
    icon: "text-navy/70",
    Icon: Info,
  },
  WARNING: {
    wrap: "border-amber-400/50 bg-amber-50 text-amber-900",
    icon: "text-amber-700",
    Icon: AlertTriangle,
  },
  MAINTENANCE: {
    wrap: "border-navy/25 bg-navy text-white",
    icon: "text-amber-300",
    Icon: Wrench,
  },
}

const STORAGE_KEY = "educore.dismissed-notices"

/**
 * Platform notices from the EduCore console.
 *
 * A dismissal is remembered per browser, not per account: it is a convenience,
 * and storing it server-side would mean a write on every "x" click for
 * something nobody audits. A notice marked non-dismissible has no close
 * button — that is the point of the flag, and hiding it locally anyway would
 * defeat it.
 */
export function PlatformBanner({ notices }: { notices: PlatformNotice[] }) {
  const [dismissed, setDismissed] = React.useState<string[]>([])
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      setDismissed(stored ? (JSON.parse(stored) as string[]) : [])
    } catch {
      // Private mode, blocked storage — show everything.
    }
    setReady(true)
  }, [])

  function dismiss(id: string) {
    const next = [...dismissed, id]
    setDismissed(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(-50)))
    } catch {
      // Not persisting is fine; it reappears next visit.
    }
  }

  // Render nothing until storage has been read, so a dismissed banner does not
  // flash on every navigation.
  if (!ready) return null

  const visible = notices.filter((notice) => !notice.dismissible || !dismissed.includes(notice.id))
  if (visible.length === 0) return null

  return (
    <div className="space-y-2">
      {visible.map((notice) => {
        const style = STYLE[notice.type]
        return (
          <div
            key={notice.id}
            role="status"
            className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", style.wrap)}
          >
            <style.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.icon)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{notice.title}</p>
              <p className="mt-0.5 text-sm opacity-85">{notice.body}</p>
            </div>
            {notice.dismissible && (
              <button
                type="button"
                onClick={() => dismiss(notice.id)}
                aria-label={`Dismiss: ${notice.title}`}
                className="shrink-0 rounded p-1 opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
