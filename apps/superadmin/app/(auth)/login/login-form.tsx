"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm() {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [attemptsRemaining, setAttemptsRemaining] = React.useState<number | null>(null)
  const [lockedOut, setLockedOut] = React.useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    setAttemptsRemaining(null)

    const data = new FormData(event.currentTarget)

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
        }),
      })

      const payload = (await response.json()) as {
        next?: string
        error?: string
        attemptsRemaining?: number
      }

      if (!response.ok) {
        setError(payload.error ?? "Sign-in failed.")
        setLockedOut(response.status === 423)
        if (typeof payload.attemptsRemaining === "number") {
          setAttemptsRemaining(payload.attemptsRemaining)
        }
        return
      }

      // /mfa, /enroll-mfa, or straight to /console on a trusted device.
      router.push(payload.next ?? "/console")
      router.refresh()
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          disabled={pending || lockedOut}
          placeholder="you@educoreafrica.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending || lockedOut}
        />
      </div>

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

      <Button type="submit" className="w-full" disabled={pending || lockedOut}>
        {pending ? "Checking…" : "Sign in"}
      </Button>
    </form>
  )
}
