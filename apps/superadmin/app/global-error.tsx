"use client"

import * as React from "react"

/**
 * Last resort: a failure in the ROOT layout itself.
 *
 * This replaces the entire document, so it renders its own <html> and <body>
 * and carries every style inline — the app's stylesheet is exactly one of the
 * things that may have failed to get here.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error("[console] root layout failed", { message: error.message, digest: error.digest })
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0A1628",
          color: "#F8FAFC",
          fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            border: "1px solid rgba(239,68,68,.45)",
            borderRadius: 8,
            background: "#1E293B",
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>The console could not start</h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#94A3B8", lineHeight: 1.55 }}>
            Something failed before any page could render. This is usually a configuration or
            connectivity problem rather than anything you did.
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
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 11,
              textAlign: "left",
              wordBreak: "break-word",
            }}
          >
            {error.message || "No message"}
            {error.digest ? ` · digest ${error.digest}` : ""}
          </code>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              height: 32,
              padding: "0 14px",
              borderRadius: 6,
              background: "#3B82F6",
              border: "1px solid #3B82F6",
              color: "#0A1628",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  )
}
