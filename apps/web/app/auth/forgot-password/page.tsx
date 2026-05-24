import { ForgotPasswordFlow } from "@/components/auth/forgot-password-flow"
import { AuthCard } from "@/components/auth/auth-card"

export const metadata = { title: "Reset password · EduCore Africa" }

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      eyebrow="Reset access"
      title="Reset your password"
      description="We'll send a 6-digit code to your email and phone if we recognise your account."
    >
      <ForgotPasswordFlow />
    </AuthCard>
  )
}
