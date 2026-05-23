"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dayjs from "dayjs"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Megaphone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { RichBody } from "@/components/dashboard/announcements/rich-body"

type Item = {
  id: string
  title: string
  body: string
  bodyHtml: string
  audience: string
  publishedAt: string
  expiresAt: string | null
  author: string | null
  scope: string | null
  readAt: string | null
}

// How long an item must stay visible before we count it as "read".
const READ_DWELL_MS = 800
// Fraction of the row that must be on-screen to start the dwell timer.
const READ_VISIBILITY_THRESHOLD = 0.5

export function AnnouncementsFeed() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<{ items: Item[] }>({
    queryKey: ["announcements", "me"],
    queryFn: async () => {
      const res = await fetch("/api/announcements?limit=10")
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
  })

  // Snapshot which items were unread on first load so the "New" pill keeps
  // showing for them even after we've marked them read server-side.
  const wasUnread = useRef<Set<string>>(new Set())
  const marked = useRef<Set<string>>(new Set())
  const [, force] = useState(0)

  useEffect(() => {
    if (!data) return
    for (const i of data.items) {
      if (!i.readAt) wasUnread.current.add(i.id)
    }
    force((v) => v + 1) // re-render so new pills show right away
  }, [data])

  const markRead = useCallback(
    async (id: string) => {
      if (marked.current.has(id)) return
      marked.current.add(id)
      await fetch(`/api/announcements/${id}/read`, { method: "POST" }).catch(() => null)
      qc.invalidateQueries({ queryKey: ["notifications"] })
    },
    [qc],
  )

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading announcements…
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Megaphone className="h-4 w-4" />
        No announcements right now.
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {data.items.map((a) => (
        <AnnouncementItem
          key={a.id}
          item={a}
          isNew={wasUnread.current.has(a.id)}
          onSeen={() => markRead(a.id)}
        />
      ))}
    </ul>
  )
}

function AnnouncementItem({
  item: a,
  isNew,
  onSeen,
}: {
  item: Item
  isNew: boolean
  onSeen: () => void
}) {
  const ref = useRef<HTMLLIElement | null>(null)
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seenRef = useRef(false)

  useEffect(() => {
    // Items that were already read on load don't need to be observed.
    if (!isNew || seenRef.current) return
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === "undefined") {
      // Fallback for environments without IntersectionObserver — mark on mount.
      seenRef.current = true
      onSeen()
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (
            entry.isIntersecting &&
            entry.intersectionRatio >= READ_VISIBILITY_THRESHOLD
          ) {
            if (!dwellRef.current) {
              dwellRef.current = setTimeout(() => {
                if (!seenRef.current) {
                  seenRef.current = true
                  onSeen()
                  observer.disconnect()
                }
              }, READ_DWELL_MS)
            }
          } else if (dwellRef.current) {
            clearTimeout(dwellRef.current)
            dwellRef.current = null
          }
        }
      },
      { threshold: [0, READ_VISIBILITY_THRESHOLD, 1] },
    )
    observer.observe(el)
    return () => {
      if (dwellRef.current) clearTimeout(dwellRef.current)
      observer.disconnect()
    }
  }, [isNew, onSeen])

  return (
    <li ref={ref} className="rounded-md border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold leading-tight">{a.title}</p>
            {isNew && (
              <Badge className="bg-emerald-500 text-[10px] hover:bg-emerald-500">New</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {dayjs(a.publishedAt).format("D MMM YYYY · h:mm A")}
            {a.author ? ` · ${a.author}` : ""}
          </p>
        </div>
        {a.scope && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {a.scope}
          </Badge>
        )}
      </div>
      <RichBody html={a.bodyHtml} className="mt-2" />
    </li>
  )
}
