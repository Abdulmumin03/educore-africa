"use client"

import { useEffect, useRef, useState } from "react"
import { Html5Qrcode } from "html5-qrcode"
import { Loader2 } from "lucide-react"

/**
 * Wraps html5-qrcode in a React component. Calls `onScan` with the decoded
 * text whenever a code is successfully read; debounces duplicates within
 * 1.5s so we don't fire repeatedly while a code stays in frame.
 */
export function QrScanner({
  onScan,
  paused,
}: {
  onScan: (text: string) => void
  paused?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastScanRef = useRef<{ text: string; at: number } | null>(null)
  const [status, setStatus] = useState<"idle" | "starting" | "running" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!containerRef.current) return

    const elementId = "qr-scanner-region"
    containerRef.current.id = elementId
    const scanner = new Html5Qrcode(elementId, { verbose: false })
    scannerRef.current = scanner
    setStatus("starting")

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          const now = Date.now()
          const last = lastScanRef.current
          if (last && last.text === decoded && now - last.at < 1500) return
          lastScanRef.current = { text: decoded, at: now }
          onScan(decoded)
        },
        () => {
          // Per-frame errors fire constantly when no code is in view — ignore.
        },
      )
      .then(() => !cancelled && setStatus("running"))
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : "Couldn't start camera"
        setError(msg)
        setStatus("error")
      })

    return () => {
      cancelled = true
      const s = scannerRef.current
      if (s) {
        s.stop()
          .catch(() => {})
          .finally(() => s.clear())
      }
    }
    // onScan is captured by closure; re-mount only if it visibly changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const s = scannerRef.current
    if (!s) return
    if (paused) s.pause(true)
    else s.resume()
  }, [paused])

  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-black">
        <div ref={containerRef} className="absolute inset-0" />
        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting camera…
          </div>
        )}
      </div>
      {status === "error" && (
        <p className="text-xs text-destructive">
          {error}. Make sure you&apos;ve granted camera permission and that the page is loaded over HTTPS.
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">
        Hold a student&apos;s QR ID card in front of the camera. They&apos;ll auto-mark PRESENT.
      </p>
    </div>
  )
}
