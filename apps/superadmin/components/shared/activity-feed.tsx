"use client"

import * as React from "react"
import Link from "next/link"
import { Ban, Building2, CreditCard, LifeBuoy, ShieldAlert } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type ActivityType =
  | "school_signup"
  | "payment_received"
  | "ticket_opened"
  | "school_suspended"
  | "user_login_anomaly"

type ActivityEvent = {
  id: string
  type: ActivityType
  message: string
  school: string | null
  link: string
  at: string
}

const MAX_EVENTS = 20

const ICONS: Record<ActivityType, LucideIcon> = {
  school_signup: Building2,
  payment_received: CreditCard,
  ticket_opened: LifeBuoy,
  school_suspended: Ban,
  user_login_anomaly: ShieldAlert,
}

const TINTS: Record<ActivityType, string> = {
  school_signup: "bg-sa-blue/15 text-sa-blue",
  payment_received: "bg-sa-green/15 text-sa-green",
  ticket_opened: "bg-sa-amber/15 text-sa-amber",
  school_suspended: "bg-sa-red/15 text-sa-red",
  user_login_anomaly: "bg-sa-purple/15 text-sa-purple",
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/**
 * Server-Sent Events. EventSource reconnects on its own, so there is no
 * retry loop here; the stream backfills on connect, which also covers
 * whatever was missed while disconnected.
 */
export function ActivityFeed() {
  const [events, setEvents] = React.useState<ActivityEvent[]>([])
  const [status, setStatus] = React.useState<"connecting" | "live" | "offline">("connecting")

  React.useEffect(() => {
    const source = new EventSource("/api/activity-feed")

    const merge = (incoming: ActivityEvent[]) => {
      setEvents((previous) => {
        const seen = new Set(previous.map((event) => event.id))
        const fresh = incoming.filter((event) => !seen.has(event.id))
        if (fresh.length === 0) return previous
        return [...fresh, ...previous]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, MAX_EVENTS)
      })
    }

    source.addEventListener("backfill", (event) => {
      setStatus("live")
      merge((JSON.parse((event as MessageEvent).data) as { events: ActivityEvent[] }).events)
    })
    source.addEventListener("activity", (event) => {
      merge((JSON.parse((event as MessageEvent).data) as { events: ActivityEvent[] }).events)
    })
    source.addEventListener("bye", () => {
      source.close()
      setStatus("offline")
    })
    source.onopen = () => setStatus("live")
    source.onerror = () => setStatus("offline")

    return () => source.close()
  }, [])

  return (
    <>
      <div className="flex items-center justify-between border-b border-sa-border px-4 py-2.5">
        <div>
          <h2 className="text-h3">Live activity</h2>
          <p className="text-caption text-sa-dim">Across every tenant</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-caption",
            status === "live" ? "text-sa-green" : status === "connecting" ? "text-sa-dim" : "text-sa-amber",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              status === "live" ? "animate-pulse bg-sa-green" : status === "connecting" ? "bg-sa-dim" : "bg-sa-amber",
            )}
            aria-hidden="true"
          />
          {status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Reconnecting"}
        </span>
      </div>

      <div className="max-h-[320px] overflow-y-auto">
        {events.length === 0 && status !== "offline" && (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-2.5">
                <div className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-sa-raised" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-2/3 animate-pulse rounded bg-sa-raised" />
                  <div className="h-2.5 w-1/4 animate-pulse rounded bg-sa-raised" />
                </div>
              </div>
            ))}
          </div>
        )}

        {events.length === 0 && status === "offline" && (
          <p className="px-4 py-10 text-center text-body text-sa-dim">
            Feed disconnected. It will resume on its own.
          </p>
        )}

        {events.map((event, index) => {
          const Icon = ICONS[event.type]
          return (
            <Link
              key={event.id}
              href={event.link}
              className={cn(
                "flex items-center gap-2.5 border-b border-sa-border px-4 py-2.5 transition-colors last:border-b-0 hover:bg-sa-raised",
                index === 0 && "animate-in slide-in-from-top-2 fade-in duration-300",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                  TINTS[event.type],
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body">
                  {event.message}
                  {event.school && <span className="text-sa-muted"> — {event.school}</span>}
                </span>
              </span>
              <span className="tabular shrink-0 text-caption text-sa-dim">{timeAgo(event.at)}</span>
            </Link>
          )
        })}
      </div>
    </>
  )
}
