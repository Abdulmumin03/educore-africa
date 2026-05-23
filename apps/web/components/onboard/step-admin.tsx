"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <h2 className="text-xl font-semibold">Admin account</h2>
        <p className="text-sm text-muted-foreground">
          The first administrator account for your school. You can add more staff later.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" autoComplete="given-name" {...register("firstName")} aria-invalid={!!errors.firstName} />
          {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" autoComplete="family-name" {...register("lastName")} aria-invalid={!!errors.lastName} />
          {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!errors.email} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="phone">Phone (for OTP verification)</Label>
          <Input id="phone" type="tel" autoComplete="tel" placeholder="+2348012345678" {...register("phone")} aria-invalid={!!errors.phone} />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} aria-invalid={!!errors.password} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} aria-invalid={!!errors.confirmPassword} />
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button type="submit">Continue</Button>
      </div>
    </form>
  )
}
