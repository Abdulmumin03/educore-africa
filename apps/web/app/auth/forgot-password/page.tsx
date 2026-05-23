import { ForgotPasswordFlow } from "@/components/auth/forgot-password-flow"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata = { title: "Reset password · EduCore Africa" }

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Reset your password</CardTitle>
        <CardDescription>
          We&apos;ll send a 6-digit code to your email and phone if we recognise your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordFlow />
      </CardContent>
    </Card>
  )
}
