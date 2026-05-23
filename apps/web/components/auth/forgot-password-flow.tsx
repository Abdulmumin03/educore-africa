"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  forgotRequestSchema,
  resetPasswordSchema,
  type ForgotRequestInput,
  type ResetPasswordInput,
} from "@/lib/auth-schemas"

type Phase = "request" | "reset" | "done"

export function ForgotPasswordFlow() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("request")
  const [email, setEmail] = useState("")
  const [serverError, setServerError] = useState<string | null>(null)
  const [devOtp, setDevOtp] = useState<string | null>(null)

  if (phase === "done") {
    return (
      <div className="space-y-4">
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
          Password updated. You can now sign in with your new password.
        </p>
        <Button className="w-full" onClick={() => router.push("/auth/login")}>
          Go to sign in
        </Button>
      </div>
    )
  }

  if (phase === "request") {
    return (
      <RequestOtpForm
        onSent={(submittedEmail, dev) => {
          setEmail(submittedEmail)
          setDevOtp(dev ?? null)
          setServerError(null)
          setPhase("reset")
        }}
        onError={setServerError}
        externalError={serverError}
      />
    )
  }

  return (
    <ResetForm
      email={email}
      hintedOtp={devOtp}
      onBack={() => setPhase("request")}
      onSuccess={() => setPhase("done")}
    />
  )
}

function RequestOtpForm({
  onSent,
  onError,
  externalError,
}: {
  onSent: (email: string, devOtp?: string) => void
  onError: (msg: string | null) => void
  externalError: string | null
}) {
  const [submitting, setSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotRequestInput>({ resolver: zodResolver(forgotRequestSchema) })

  async function onSubmit(values: ForgotRequestInput) {
    setSubmitting(true)
    onError(null)
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: values.email, purpose: "reset-password" }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; devOtp?: string }
      if (!res.ok || !data.ok) {
        onError(data.error ?? "Couldn't send code. Try again.")
        return
      }
      onSent(values.email, data.devOtp)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@school.edu"
          {...register("email")}
          aria-invalid={!!errors.email}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      {externalError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {externalError}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Send reset code
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/auth/login" className="hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  )
}

function ResetForm({
  email,
  hintedOtp,
  onBack,
  onSuccess,
}: {
  email: string
  hintedOtp: string | null
  onBack: () => void
  onSuccess: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(60)

  useEffect(() => {
    const id = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [])

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email },
  })

  async function onResend() {
    setError(null)
    setCooldown(60)
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, purpose: "reset-password" }),
    })
    const data = (await res.json().catch(() => ({}))) as { devOtp?: string; error?: string }
    if (!res.ok) setError(data.error ?? "Resend failed")
    if (data.devOtp) setValue("otp", data.devOtp)
  }

  async function onSubmit(values: ResetPasswordInput) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't reset password")
        return
      }
      onSuccess()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <input type="hidden" {...register("email")} value={email} />
      <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        Code sent to <strong className="text-foreground">{email}</strong>
        {hintedOtp ? <span className="ml-2 font-mono text-xs">(dev: {hintedOtp})</span> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="otp">Verification code</Label>
        <Input
          id="otp"
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          {...register("otp")}
          defaultValue={hintedOtp ?? ""}
          aria-invalid={!!errors.otp}
        />
        {errors.otp && <p className="text-sm text-destructive">{errors.otp.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" type="password" {...register("password")} aria-invalid={!!errors.password} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          {...register("confirmPassword")}
          aria-invalid={!!errors.confirmPassword}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Update password
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          ← Use a different email
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={cooldown > 0}
          className="text-foreground hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  )
}
