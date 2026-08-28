"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { OtpInput } from "@/components/shared/otp-input"

export function MfaForm({ newDevice }: { newDevice: boolean }) {
  const router = useRouter()
  const [code, setCode] = React.useState("")
  const [backupCode, setBackupCode] = React.useState("")
  const [useBackup, setUseBackup] = React.useState(false)
  const [trustDevice, setTrustDevice] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [attemptsRemaining, setAttemptsRemaining] = React.useState<number | null>(null)

  const submit = React.useCallback(
    async (value: string) => {
      if (pending) return
      setPending(true)
      setError(null)
      setAttemptsRemaining(null)

      try {
        const response = await fetch("/api/auth/verify-mfa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otp: value, trustDevice }),
        })

        const payload = (await response.json()) as {
          next?: string
          error?: string
          attemptsRemaining?: number
        }

        if (!response.ok) {
          setError(payload.error ?? "Verification failed.")
          if (typeof payload.attemptsRemaining === "number") {
            setAttemptsRemaining(payload.attemptsRemaining)
          }
          setCode("")
          // A lockout or an expired challenge sends us back to the start.
          if (payload.next === "/login") {
            setTimeout(() => router.push("/login"), 1800)
          }
          return
        }

        router.push(payload.next ?? "/console")
        router.refresh()
      } catch {
        setError("Could not reach the server. Check your connection and try again.")
      } finally {
        setPending(false)
      }
    },
    [pending, router, trustDevice],
  )

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit(useBackup ? backupCode : code)
      }}
      className="space-y-5"
    >
      {useBackup ? (
        <div className="space-y-2">
          <Label htmlFor="backup-code">Backup code</Label>
          <Input
            id="backup-code"
            value={backupCode}
            onChange={(event) => setBackupCode(event.target.value)}
            autoComplete="off"
            autoFocus
            placeholder="XXXXX-XXXXX"
            className="text-center tracking-widest"
            disabled={pending}
          />
        </div>
      ) : (
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={(value) => void submit(value)}
          disabled={pending}
          autoFocus
        />
      )}

      {newDevice && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="trust-device" className="text-sm">
              Trust this device for 30 days
            </Label>
            <p className="text-xs text-muted-foreground">
              Skips the code on this browser. Do not use on shared machines.
            </p>
          </div>
          <Switch
            id="trust-device"
            checked={trustDevice}
            onCheckedChange={setTrustDevice}
            disabled={pending}
          />
        </div>
      )}

      {error && (
        <div role="alert" className="space-y-1">
          <p className="text-sm text-destructive">{error}</p>
          {attemptsRemaining !== null && attemptsRemaining > 0 && (
            <p className="text-xs text-muted-foreground">
              {attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} left before the
              account is locked for 15 minutes.
            </p>
          )}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={pending || (useBackup ? backupCode.length < 10 : code.length < 6)}
      >
        {pending ? "Verifying…" : "Verify"}
      </Button>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <button
          type="button"
          className="underline underline-offset-4 hover:text-foreground"
          onClick={() => {
            setUseBackup((previous) => !previous)
            setError(null)
          }}
        >
          {useBackup ? "Use authenticator code" : "Use a backup code"}
        </button>
        <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
          Start over
        </Link>
      </div>
    </form>
  )
}
