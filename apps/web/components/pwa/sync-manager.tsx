"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Cloud, CloudOff } from "lucide-react"
import { toast } from "sonner"
import { flushQueue, listQueue } from "@/lib/offline-queue"

/**
 * Background daemon mounted once at the app shell. When the browser comes
 * back online, replays any queued offline writes (attendance, etc.) and
 * toasts the result. Also exposes a "X pending sync" pill in the corner so
 * the user knows they have local-only data waiting to upload.
 */
export function SyncManager() {
  const qc = useQueryClient()
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(true)

  async function refreshPending() {
    const items = await listQueue()
    setPending(items.length)
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    setOnline(navigator.onLine)
    void refreshPending()

    async function onOnline() {
      setOnline(true)
      const items = await listQueue()
      if (items.length === 0) return
      const result = await flushQueue()
      if (result.succeeded > 0) {
        toast.success(
          `Synced ${result.succeeded} pending update${result.succeeded === 1 ? "" : "s"}`,
        )
        // Conservative — invalidate everything; cheaper than mapping queue keys to query keys.
        qc.invalidateQueries()
      }
      if (result.failed > 0) {
        toast.warning(
          `${result.failed} update${result.failed === 1 ? "" : "s"} couldn't sync. Will retry.`,
        )
      }
      await refreshPending()
    }
    function onOffline() {
      setOnline(false)
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)

    // Poll the queue every 10s in case other tabs enqueue while we're open.
    const t = setInterval(refreshPending, 10_000)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      clearInterval(t)
    }
  }, [qc])

  if (pending === 0 && online) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-30 flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs shadow-lg"
      role="status"
      aria-live="polite"
    >
      {online ? (
        <Cloud className="h-3.5 w-3.5 text-amber-600" />
      ) : (
        <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      {online
        ? `${pending} pending sync`
        : pending > 0
          ? `Offline · ${pending} queued`
          : "Offline"}
    </div>
  )
}
