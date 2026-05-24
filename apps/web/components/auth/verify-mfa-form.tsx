"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { otpVerifySchema, type OtpVerifyInput } from "@/lib/auth-schemas"

const RESEND_SECONDS = 60

export function VerifyMfaForm() {
  const router = useRouter()
  const search = useSearchParams()
  const emailParam = search.get("email") ?? ""
  const callbackUrl = search.get("callbackUrl") ?? "/dashboard"

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(RESEND_SECONDS)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OtpVerifyInput>({
    resolver: zodResolver(otpVerifySchema),
    defaultValues: { email: emailParam },
  })

  useEffect(() => {
    const id = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [])

  async function onResend() {
    setError(null)
    setCooldown(RESEND_SECONDS)
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: emailParam, purpose: "mfa" }),
    })
    if (!res.ok) setError("Couldn't resend code")
  }

  async function onSubmit(values: OtpVerifyInput) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, purpose: "mfa" }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Invalid code")
        return
      }
      router.replace(callbackUrl)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <input type="hidden" {...register("email")} />
      {emailParam ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-navy/75">
          Code sent to <strong className="text-navy">{emailParam}</strong>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="otp">6-digit code</Label>
        <Input
          id="otp"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
          placeholder="123456"
          {...register("otp")}
          aria-invalid={!!errors.otp}
        />
        {errors.otp && <p className="text-sm text-destructive">{errors.otp.message}</p>}
      </div>
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        className="h-11 w-full bg-navy text-white hover:bg-[#0a2350]"
        disabled={submitting}
      >
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Verify
      </Button>
      <button
        type="button"
        onClick={onResend}
        disabled={cooldown > 0}
        className="block w-full text-center text-sm font-medium text-amber-700 hover:text-amber-800 disabled:cursor-not-allowed disabled:text-navy/40"
      >
        {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
      </button>
    </form>
  )
}
