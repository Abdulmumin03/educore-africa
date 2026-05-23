"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

type Channel = "EMAIL" | "SMS" | "WHATSAPP" | "PUSH" | "IN_APP"
type Pref = { channel: Channel; enabled: boolean }

const CHANNEL_LABELS: Record<Channel, { label: string; hint: string; pending?: boolean }> = {
  EMAIL: { label: "Email", hint: "Receipts, results, weekly digest." },
  SMS: { label: "SMS", hint: "Attendance alerts, fee reminders." },
  WHATSAPP: {
    label: "WhatsApp",
    hint: "Provider not yet configured — your choice will be honored once it is.",
    pending: true,
  },
  PUSH: {
    label: "Push",
    hint: "Provider not yet configured — your choice will be honored once it is.",
    pending: true,
  },
  IN_APP: { label: "In-app", hint: "Notification bell on the dashboard." },
}

export function NotificationPrefs() {
  const { data, isLoading } = useQuery<{ preferences: Pref[] }>({
    queryKey: ["me", "notification-preferences"],
    queryFn: async () => {
      const res = await fetch("/api/me/notification-preferences")
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
  })

  const [prefs, setPrefs] = useState<Pref[]>([])
  useEffect(() => {
    if (data) setPrefs(data.preferences)
  }, [data])

  const save = useMutation({
    mutationFn: async (next: Pref[]) => {
      const res = await fetch("/api/me/notification-preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences: next }),
      })
      if (!res.ok) throw new Error("Couldn't save")
      return res.json()
    },
    onSuccess: () => toast.success("Preferences saved"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  function toggle(channel: Channel) {
    setPrefs((prev) =>
      prev.map((p) => (p.channel === channel ? { ...p, enabled: !p.enabled } : p)),
    )
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading preferences…
      </div>
    )
  }

  const dirty = JSON.stringify(prefs) !== JSON.stringify(data.preferences)

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-md border">
        {prefs.map((p) => {
          const meta = CHANNEL_LABELS[p.channel]
          return (
            <li
              key={p.channel}
              className="flex items-center justify-between gap-4 px-3 py-2.5"
            >
              <div>
                <Label className="text-sm font-medium">
                  {meta.label}
                  {meta.pending && (
                    <span className="ml-2 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      Coming soon
                    </span>
                  )}
                </Label>
                <p className="text-xs text-muted-foreground">{meta.hint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={p.enabled}
                onClick={() => toggle(p.channel)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  p.enabled ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform ${
                    p.enabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => save.mutate(prefs)}
          disabled={!dirty || save.isPending}
        >
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save preferences
        </Button>
      </div>
    </div>
  )
}
