"use client"

import * as React from "react"
import Link from "next/link"
import { Bell, Building2, CreditCard, LifeBuoy, ShieldAlert } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type NotificationType = "school_signup" | "payment_received" | "ticket_opened" | "system_alert"

type Notification = {
  id: string
  type: NotificationType
  message: string
  link: string
  createdAt: string
  isRead: boolean
}

const POLL_MS = 30_000

const ICONS: Record<NotificationType, LucideIcon> = {
  school_signup: Building2,
  payment_received: CreditCard,
  ticket_opened: LifeBuoy,
  system_alert: ShieldAlert,
}

const TINTS: Record<NotificationType, string> = {
  school_signup: "bg-sa-blue/15 text-sa-blue",
  payment_received: "bg-sa-green/15 text-sa-green",
  ticket_opened: "bg-sa-amber/15 text-sa-amber",
  system_alert: "bg-sa-red/15 text-sa-red",
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export function NotificationBell() {
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<Notification[]>([])
  const [unread, setUnread] = React.useState(0)
  const [loaded, setLoaded] = React.useState(false)

  const load = React.useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/notifications", { signal })
      if (!response.ok) return
      const payload = (await response.json()) as {
        notifications: Notification[]
        unreadCount: number
      }
      setItems(payload.notifications)
      setUnread(payload.unreadCount)
    } catch {
      // Offline or aborted — keep whatever we last had.
    } finally {
      setLoaded(true)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)

    const timer = setInterval(() => {
      // Don't poll a backgrounded tab; refresh happens on focus instead.
      if (document.visibilityState === "visible") void load()
    }, POLL_MS)

    const onFocus = () => void load()
    window.addEventListener("focus", onFocus)

    return () => {
      controller.abort()
      clearInterval(timer)
      window.removeEventListener("focus", onFocus)
    }
  }, [load])

  async function markAllRead() {
    // Optimistic: the watermark write is not worth a spinner.
    setItems((previous) => previous.map((item) => ({ ...item, isRead: true })))
    setUnread(0)
    try {
      await fetch("/api/notifications/read", { method: "PATCH" })
    } catch {
      void load()
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-sa-muted transition-colors hover:bg-sa-raised hover:text-sa-text"
        >
          <Bell className="h-[17px] w-[17px]" aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full border-2 border-sa-surface bg-sa-red px-[3px] font-mono text-[10px] font-bold leading-none text-sa-base">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 border-sa-border-em bg-sa-overlay p-0">
        <div className="flex items-center justify-between border-b border-sa-border-em px-3 py-2">
          <span className="text-h3">Notifications</span>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unread === 0}
            className="text-caption text-sa-blue transition-colors hover:text-sa-blue/80 disabled:cursor-not-allowed disabled:text-sa-disabled"
          >
            Mark all read
          </button>
        </div>

        <div className="max-h-[380px] overflow-y-auto">
          {!loaded && (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-2.5">
                  <div className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-sa-raised" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-3/4 animate-pulse rounded bg-sa-raised" />
                    <div className="h-2.5 w-1/3 animate-pulse rounded bg-sa-raised" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {loaded && items.length === 0 && (
            <p className="px-3 py-8 text-center text-body text-sa-dim">
              Nothing in the last 14 days.
            </p>
          )}

          {items.map((item) => {
            const Icon = ICONS[item.type]
            return (
              <Link
                key={item.id}
                href={item.link}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-start gap-2.5 border-b border-sa-border-em/50 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-sa-raised",
                  !item.isRead && "bg-sa-blue/[0.07]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    TINTS[item.type],
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body leading-snug">{item.message}</span>
                  <span className="mt-0.5 block font-mono text-caption text-sa-dim">
                    {timeAgo(item.createdAt)} ago
                  </span>
                </span>
                {!item.isRead && (
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sa-blue"
                    aria-label="Unread"
                  />
                )}
              </Link>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
