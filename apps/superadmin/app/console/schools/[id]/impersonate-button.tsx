"use client"

import * as React from "react"
import { Loader2, ScanEye } from "lucide-react"

import { useToast } from "@/hooks/use-toast"

/**
 * Opens the school's own app in a new tab under a one-hour read-only grant.
 * The plaintext token exists only in the response and the URL we hand to
 * window.open — it is never stored client-side.
 */
export function ImpersonateButton({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const { toast } = useToast()
  const [pending, setPending] = React.useState(false)

  async function start() {
    setPending(true)
    try {
      const response = await fetch(`/api/schools/${schoolId}/impersonate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Opened from the school profile" }),
      })
      const payload = await response.json()

      if (!response.ok) {
        toast({
          variant: "destructive",
          title: "Could not start the session",
          description: payload.error ?? "Your role may not permit impersonation.",
        })
        return
      }

      window.open(payload.redirectUrl, "_blank", "noopener,noreferrer")
      toast({
        title: `Viewing ${schoolName} as support`,
        description: "Read-only, expires in 1 hour. Start and end are both recorded in the audit log.",
      })
    } catch {
      toast({ variant: "destructive", title: "Could not reach the server" })
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={pending}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sa-border-em bg-sa-surface px-3 text-body font-medium transition-colors hover:bg-sa-raised disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <ScanEye className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      View as Admin
    </button>
  )
}
