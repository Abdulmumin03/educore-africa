"use client"

import { useEffect, useState } from "react"
import { Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const VISIT_KEY = "educore.visits"
const DISMISSED_KEY = "educore.install-dismissed"
const VISIT_THRESHOLD = 3

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

/**
 * Custom "Add to home screen" banner. Counts visits in localStorage; shows
 * after the 3rd visit if the user hasn't already dismissed and the browser
 * fired `beforeinstallprompt`. Stays out of the way on desktop and in
 * non-PWA-compatible browsers (no event → never shown).
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    // Bump visit counter on every mount, unless already installed.
    try {
      const visits = Number(localStorage.getItem(VISIT_KEY) ?? "0") + 1
      localStorage.setItem(VISIT_KEY, String(visits))
      const dismissed = localStorage.getItem(DISMISSED_KEY) === "1"
      if (dismissed || visits < VISIT_THRESHOLD) return
    } catch {
      return
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall)
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1")
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  async function install() {
    if (!event) return
    await event.prompt()
    await event.userChoice
    // Browser hides the prompt after a choice; clear our flag either way.
    dismiss()
  }

  if (!visible || !event) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[min(100%-2rem,28rem)] -translate-x-1/2 rounded-lg border bg-card p-3 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Download className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install EduCore on this device</p>
          <p className="text-xs text-muted-foreground">
            Faster access and works offline for attendance, timetables, and announcements.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Not now
        </Button>
        <Button size="sm" onClick={install}>
          Install
        </Button>
      </div>
    </div>
  )
}
