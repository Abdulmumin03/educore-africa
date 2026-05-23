import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { VerifyMfaForm } from "@/components/auth/verify-mfa-form"

export const metadata = { title: "Verify · EduCore Africa" }

export default function VerifyMfaPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Two-factor verification</CardTitle>
        <CardDescription>
          Enter the 6-digit code we sent you to finish signing in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <VerifyMfaForm />
        </Suspense>
      </CardContent>
    </Card>
  )
}
