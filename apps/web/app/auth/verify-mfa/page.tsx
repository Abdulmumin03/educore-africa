import { Suspense } from "react"
import { AuthCard } from "@/components/auth/auth-card"
import { Skeleton } from "@/components/ui/skeleton"
import { VerifyMfaForm } from "@/components/auth/verify-mfa-form"

export const metadata = { title: "Verify · EduCore Africa" }

export default function VerifyMfaPage() {
  return (
    <AuthCard
      eyebrow="Two-factor"
      title="Verify it's really you"
      description="Enter the 6-digit code we sent you to finish signing in."
    >
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <VerifyMfaForm />
      </Suspense>
    </AuthCard>
  )
}
