"use client"

import * as React from "react"
import { Loader2, RefreshCw, Sparkles } from "lucide-react"

export type Snapshot = {
  text: string
  source: "model" | "heuristic"
  model: string | null
  generatedAt: string
  cached?: boolean
}

export function AiSnapshot({ initial }: { initial: Snapshot }) {
  const [snapshot, setSnapshot] = React.useState(initial)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  /** Text arriving from the stream, shown in place of the cached snapshot. */
  const [streaming, setStreaming] = React.useState<string | null>(null)

  /**
   * Regenerating takes the better part of a minute at this effort level, so
   * the text is read off an SSE stream rather than awaited whole. The `done`
   * event carries the same body the JSON route returns and replaces whatever
   * accumulated, so the panel never ends up showing a partial generation as
   * if it were finished.
   */
  async function refresh() {
    setPending(true)
    setError(null)
    setStreaming("")

    try {
      const response = await fetch("/api/ai/business-snapshot/stream")
      if (!response.ok || !response.body) {
        setError("Could not regenerate the snapshot.")
        setStreaming(null)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let text = ""
      let finished = false

      // SSE frames are separated by a blank line and can be split across
      // chunks, so the tail of the buffer is kept until the next read.
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const frames = buffer.split("\n\n")
        buffer = frames.pop() ?? ""

        for (const frame of frames) {
          const event = /^event:\s*(.+)$/m.exec(frame)?.[1]?.trim()
          const raw = /^data:\s*(.+)$/m.exec(frame)?.[1]
          if (!event || !raw) continue

          let payload: Record<string, unknown>
          try {
            payload = JSON.parse(raw) as Record<string, unknown>
          } catch {
            continue
          }

          if (event === "delta") {
            if (payload.reset === true) text = ""
            else text += String(payload.text ?? "")
            setStreaming(text)
          } else if (event === "done") {
            setSnapshot(payload as unknown as Snapshot)
            finished = true
          } else if (event === "error") {
            setError(String(payload.message ?? "Could not regenerate the snapshot."))
          }
        }
      }

      // The connection closed without a `done` — the partial is dropped and
      // the previous snapshot stays on screen.
      if (!finished) setError((current) => current ?? "The snapshot ended before it finished.")
    } catch {
      setError("Could not reach the server.")
    } finally {
      setStreaming(null)
      setPending(false)
    }
  }

  const generated = new Date(snapshot.generatedAt).toLocaleString("en-NG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    // The purple gradient border is a 1px padded wrapper — a real border
    // cannot take a gradient.
    <div
      className="rounded-[9px] p-px"
      style={{
        background:
          "linear-gradient(110deg, #8B5CF6 0%, rgba(139,92,246,0.35) 38%, rgba(59,130,246,0.35) 68%, #8B5CF6 100%)",
      }}
    >
      <div className="flex items-start gap-4 rounded-lg bg-sa-surface p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-sa-purple" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sa-purple">
              EduCore Intelligence — Weekly Snapshot
            </span>
            <span className="text-caption text-sa-dim">
              · generated <span className="tabular">{generated}</span>
              {snapshot.source === "model" && snapshot.model ? ` · ${snapshot.model}` : ""}
            </span>
            {snapshot.source === "heuristic" && (
              <span className="rounded bg-sa-amber/15 px-2 py-0.5 text-caption text-sa-amber">
                Rule-based — no ANTHROPIC_API_KEY set
              </span>
            )}
          </div>

          <div className="mt-3 space-y-3">
            {(streaming ?? snapshot.text).split(/\n\s*\n/).map((paragraph, index) => (
              <p
                key={index}
                className="max-w-[96ch] font-mono text-body leading-[1.7] text-sa-text/85"
              >
                {paragraph}
                {streaming !== null && index === streaming.split(/\n\s*\n/).length - 1 && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-sa-purple align-middle" />
                )}
              </p>
            ))}
            {streaming === "" && (
              <p className="font-mono text-body text-sa-dim">Reading this week&rsquo;s figures…</p>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-2 text-caption text-sa-red">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sa-purple/40 bg-sa-purple/15 px-3 text-body font-medium text-sa-purple transition-colors hover:bg-sa-purple/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {pending ? "Generating…" : "Refresh"}
          </button>
          <span className="text-caption text-sa-dim">cached 6h</span>
        </div>
      </div>
    </div>
  )
}
