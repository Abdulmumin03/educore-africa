"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { stepAdminSchema, type StepAdminInput } from "@/lib/auth-schemas"

type Props = {
  defaults?: StepAdminInput
  onBack: () => void
  onSubmit: (values: StepAdminInput) => void
}

export function StepAdmin({ defaults, onBack, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StepAdminInput>({
    resolver: zodResolver(stepAdminSchema),
    defaultValues: defaults,
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-7" noValidate>
      <ScrollReveal>
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Step 2 of 5
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-navy md:text-3xl">
            Admin account
          </h2>
          <p className="mt-1.5 text-sm text-navy/65">
            The first administrator account for your school. You can add more staff later.
          </p>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={80}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName" className="text-navy">First name</Label>
            <Input
              id="firstName"
              autoComplete="given-name"
              {...register("firstName")}
              aria-invalid={!!errors.firstName}
            />
            {errors.firstName && (
              <p className="text-sm text-destructive">{errors.firstName.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName" className="text-navy">Last name</Label>
            <Input
              id="lastName"
              autoComplete="family-name"
              {...register("lastName")}
              aria-invalid={!!errors.lastName}
            />
            {errors.lastName && (
              <p className="text-sm text-destructive">{errors.lastName.message}</p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="email" className="text-navy">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email")}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="phone" className="text-navy">
              Phone <span className="text-navy/45">(for OTP verification)</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+2348012345678"
              {...register("phone")}
              aria-invalid={!!errors.phone}
            />
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-navy">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register("password")}
              aria-invalid={!!errors.password}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-navy">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
              aria-invalid={!!errors.confirmPassword}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={160}>
        <div className="flex items-center justify-between border-t border-navy/10 pt-5">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="text-navy/65 hover:bg-cream-soft hover:text-navy"
          >
            ← Back
          </Button>
          <Button
            type="submit"
            className="h-11 bg-navy px-6 text-white hover:bg-[#0a2350]"
          >
            Continue →
          </Button>
        </div>
      </ScrollReveal>
    </form>
  )
}
