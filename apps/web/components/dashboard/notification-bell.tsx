"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Bell, BellRing, CircleDollarSign, ClipboardCheck, FileBarChart, Wrench } from "lucide-react"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

dayjs.extend(relativeTime)

type Notification = {
  id: string
  channel: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
  metadata?: { kind?: string; href?: string } | null
}

type NotificationsResponse = {
  unreadCount: number
  items: Notification[]
}

async function fetchNotifications(): Promise<NotificationsResponse> {
  const res = await fetch("/api/notifications?limit=10")
  if (!res.ok) throw new Error("Failed to load notifications")
  return res.json()
}

async function markAllRead(): Promise<void> {
  await fetch("/api/notifications/mark-read", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ all: true }),
  })
}

function kindIcon(kind?: string) {
  switch (kind) {
    case "payment":
      return CircleDollarSign
    case "attendance":
      return ClipboardCheck
    case "grade":
      return FileBarChart
    default:
      return Wrench
  }
}

export function NotificationBell() {
  const router = useRouter()
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    refetchInterval: 30_000,
  })
  const mutate = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })

  const unread = data?.unreadCount ?? 0
  const items = data?.items ?? []

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          {unread > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full px-1 text-[10px]"
            >
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <button
            onClick={() => mutate.mutate()}
            disabled={unread === 0 || mutate.isPending}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Mark all read
          </button>
        </div>
        <ul className="max-h-96 overflow-y-auto divide-y">
          {items.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </li>
          )}
          {items.map((item) => {
            const Icon = kindIcon(item.metadata?.kind)
            const isUnread = !item.readAt
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (item.metadata?.href) router.push(item.metadata.href)
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-muted/60",
                    isUnread && "bg-primary/5",
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{item.title}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {dayjs(item.createdAt).fromNow()}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
