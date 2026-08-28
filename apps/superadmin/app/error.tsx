"use client"

import * as React from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"

/**
 * Error boundary for the pages outside the console shell.
 *
 * Next calls this when a render or a server component in this segment throws.
 * The rest of the console keeps working — the shell, the nav and every other
 * route are outside this boundary.
 *
 * The technical line is shown rather than hidden. An operator reporting a
 * problem needs something to paste, and `digest` is the only handle that ties
 * what they saw to the server log entry.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // Sentry is not wired into this app (no DSN, no SDK). Until it is, the
    // browser console is where this lands — stated plainly rather than left
    // to look like reporting that silently does nothing.
    console.error("[console] unhandled error", { message: error.message, digest: error.digest })
  }, [error])

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 24px" }}>
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          border: "1px solid rgba(239,68,68,.45)",
          borderRadius: 8,
          background: "#1E293B",
          padding: 24,
          textAlign: "center",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "rgba(239,68,68,.14)",
            border: "1px solid rgba(239,68,68,.4)",
          }}
        >
          <AlertTriangle width={22} height={22} color="#F87171" aria-hidden="true" />
        </span>

        <h2 style={{ margin: "12px 0 0", fontSize: 16, fontWeight: 600, color: "#F8FAFC" }}>
          Something went wrong
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94A3B8", lineHeight: 1.55 }}>
          This page failed to render. Retry, or sign in again.
        </p>

        <code
          style={{
            display: "block",
            marginTop: 14,
            padding: "8px 11px",
            borderRadius: 6,
            background: "#16233A",
            border: "1px solid #2D4A6E",
            color: "#94A3B8",
            fontFamily: "var(--font-mono), ui-monospace, monospace",
            fontSize: 11,
            textAlign: "left",
            lineHeight: 1.5,
            wordBreak: "break-word",
          }}
        >
          {error.message || "No message"}
          {error.digest ? <><br />digest {error.digest}</> : null}
        </code>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button
            type="button"
            onClick={reset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              background: "#3B82F6",
              border: "1px solid #3B82F6",
              color: "#0A1628",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <RotateCcw width={14} height={14} aria-hidden="true" />
            Retry
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(
                `${error.message}${error.digest ? ` · digest ${error.digest}` : ""}`,
              )
            }}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              background: "#1E293B",
              border: "1px solid #2D4A6E",
              color: "#F8FAFC",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Copy details
          </button>
        </div>
      </div>
    </div>
  )
}
