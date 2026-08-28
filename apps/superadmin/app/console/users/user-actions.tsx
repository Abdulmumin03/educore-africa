"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { KeyRound, Lock, Unlock } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Lock / unlock and temporary-password actions on one school account.
 *
 * The temporary password is shown once, inline, and never persisted anywhere
 * the console can read it back — copying it out is the operator's job.
 */
export function UserActions({
  userId,
  email,
  isActive,
}: {
  userId: string
  email: string
  isActive: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState<null | "lock" | "reset">(null)
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [issued, setIssued] = React.useState<{ password: string; notice: string } | null>(null)

  async function toggleLock() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/users/${userId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: isActive, reason: reason.trim() }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error ?? "Could not change the account.")
      setOpen(null)
      setReason("")
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/users/${userId}/reset-password`, { method: "POST" })
      const data = (await response.json()) as {
        temporaryPassword?: string
        notice?: string
        error?: string
      }
      if (!response.ok || !data.temporaryPassword) {
        throw new Error(data.error ?? "Could not issue a password.")
      }
      setIssued({ password: data.temporaryPassword, notice: data.notice ?? "" })
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {open === null && !issued && (
        <>
          <button
            type="button"
            onClick={() => setOpen("reset")}
            title="Issue a temporary password"
            className="rounded p-1 text-sa-dim transition-colors hover:bg-sa-raised hover:text-sa-text"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span className="sr-only">Issue a temporary password for {email}</span>
          </button>
          <button
            type="button"
            onClick={() => setOpen("lock")}
            title={isActive ? "Disable this account" : "Re-enable this account"}
            className={cn(
              "rounded p-1 transition-colors hover:bg-sa-raised",
              isActive ? "text-sa-dim hover:text-sa-red" : "text-sa-amber hover:text-sa-green",
            )}
          >
            {isActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            <span className="sr-only">
              {isActive ? "Disable" : "Re-enable"} {email}
            </span>
          </button>
        </>
      )}

      {open === "lock" && (
        <div className="flex items-center gap-1.5">
          {isActive && (
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason (required)"
              className="h-7 w-40 rounded border border-sa-border bg-sa-raised px-2 text-caption text-sa-text placeholder:text-sa-disabled focus:border-sa-blue focus:outline-none"
            />
          )}
          <button
            type="button"
            disabled={busy || (isActive && !reason.trim())}
            onClick={() => void toggleLock()}
            className="h-7 rounded border border-sa-red/50 px-2 text-caption text-sa-red transition-colors hover:bg-sa-red/10 disabled:opacity-40"
          >
            {busy ? "…" : isActive ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(null)
              setError(null)
            }}
            className="h-7 rounded px-1.5 text-caption text-sa-dim hover:text-sa-text"
          >
            Cancel
          </button>
        </div>
      )}

      {open === "reset" && !issued && (
        <div className="flex items-center gap-1.5">
          <span className="text-caption text-sa-amber">Kills every session. Continue?</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resetPassword()}
            className="h-7 rounded border border-sa-amber/50 px-2 text-caption text-sa-amber transition-colors hover:bg-sa-amber/10 disabled:opacity-40"
          >
            {busy ? "…" : "Issue"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="h-7 rounded px-1.5 text-caption text-sa-dim hover:text-sa-text"
          >
            Cancel
          </button>
        </div>
      )}

      {issued && (
        <div className="flex items-center gap-2">
          <code className="rounded bg-sa-raised px-2 py-1 font-mono text-caption text-sa-text">
            {issued.password}
          </code>
          <button
            type="button"
            onClick={() => {
              setIssued(null)
              setOpen(null)
            }}
            className="h-7 rounded px-1.5 text-caption text-sa-dim hover:text-sa-text"
          >
            Done
          </button>
        </div>
      )}

      {error && <span className="text-caption text-sa-red">{error}</span>}
    </div>
  )
}
