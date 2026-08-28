"use client"

import * as React from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Check, Copy, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { OtpInput } from "@/components/shared/otp-input"

type Enrolment = { secret: string; qrDataUrl: string; email: string }

/**
 * The enrolment flow, shared by forced enrolment (/enroll-mfa, no session
 * yet) and voluntary re-enrolment (/console/settings/security/totp).
 *
 * Backup codes are generated only once the code is confirmed — issuing them
 * for an enrolment that is then abandoned would leave usable codes lying
 * around an account with no TOTP.
 */
export function TotpEnrolment({ forced = false }: { forced?: boolean }) {
  const router = useRouter()
  const [enrolment, setEnrolment] = React.useState<Enrolment | null>(null)
  const [code, setCode] = React.useState("")
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null)
  const [next, setNext] = React.useState("/console")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const started = React.useRef(false)

  React.useEffect(() => {
    // React 18 StrictMode double-invokes effects in dev; a second call would
    // mint a second secret and invalidate the QR the user is already scanning.
    if (started.current) return
    started.current = true

    void (async () => {
      try {
        const response = await fetch("/api/auth/totp/enroll", { method: "POST" })
        const payload = await response.json()
        if (!response.ok) {
          setError(payload.error ?? "Could not start enrolment.")
          return
        }
        setEnrolment(payload as Enrolment)
      } catch {
        setError("Could not reach the server.")
      }
    })()
  }, [])

  async function confirm(value: string) {
    if (pending) return
    setPending(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error ?? "That code was not accepted.")
        setCode("")
        return
      }

      setBackupCodes(payload.backupCodes as string[])
      setNext(payload.next ?? "/console")
    } catch {
      setError("Could not reach the server.")
    } finally {
      setPending(false)
    }
  }

  // ── Step 3: codes to keep, shown exactly once ──
  if (backupCodes) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Save your backup codes</p>
          <p className="text-xs text-muted-foreground">
            Each code works once, if you lose your authenticator. This is the only time they are
            shown.
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
          {backupCodes.map((backupCode) => (
            <li key={backupCode} className="tabular-nums">
              {backupCode}
            </li>
          ))}
        </ul>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            void navigator.clipboard?.writeText(backupCodes.join("\n"))
            setCopied(true)
          }}
        >
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? "Copied" : "Copy codes"}
        </Button>

        <Button
          className="w-full"
          onClick={() => {
            router.push(next)
            router.refresh()
          }}
        >
          {forced ? "Continue to console" : "Done"}
        </Button>
      </div>
    )
  }

  if (error && !enrolment) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (!enrolment) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing enrolment…
      </div>
    )
  }

  // ── Steps 1 & 2: scan, then prove it ──
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void confirm(code)
      }}
      className="space-y-4"
    >
      <ol className="space-y-3 text-sm">
        <li>
          <span className="font-medium">1.</span> Scan this with Google Authenticator (or any TOTP
          app).
        </li>
      </ol>

      <div className="flex justify-center rounded-md border border-border bg-white p-3">
        <Image
          src={enrolment.qrDataUrl}
          alt="TOTP enrolment QR code"
          width={200}
          height={200}
          unoptimized
        />
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer underline underline-offset-4">
          Can&apos;t scan? Enter the key manually
        </summary>
        <code className="mt-2 block break-all rounded bg-muted/60 p-2 font-mono text-[11px]">
          {enrolment.secret}
        </code>
      </details>

      <Separator />

      <div className="space-y-2">
        <Label>2. Enter the 6-digit code it shows</Label>
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={(value) => void confirm(value)}
          disabled={pending}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending || code.length < 6}>
        {pending ? "Confirming…" : "Confirm and continue"}
      </Button>
    </form>
  )
}
