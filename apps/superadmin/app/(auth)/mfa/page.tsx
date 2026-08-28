import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MFA_COOKIE, verifyChallenge } from "@/lib/auth-challenge"
import { TRUSTED_DEVICE_COOKIE } from "@/lib/trusted-device"
import { MfaForm } from "./mfa-form"

export const metadata: Metadata = { title: "Two-factor" }

export default function MfaPage() {
  const jar = cookies()
  const challenge = jar.get(MFA_COOKIE)?.value

  // No valid challenge means the password step was skipped or has expired.
  // An "enroll" challenge belongs on /enroll-mfa, not here.
  if (!verifyChallenge(challenge, "mfa")) {
    redirect(verifyChallenge(challenge, "enroll") ? "/enroll-mfa" : "/login")
  }

  // Only offer "trust this device" when there is no trust cookie already —
  // if there were a valid one, sign-in would not have reached this page.
  const newDevice = !jar.get(TRUSTED_DEVICE_COOKIE)?.value

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Enter your 6-digit authenticator code</CardTitle>
        <CardDescription>
          Open your authenticator app and enter the current code for EduCore Console.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MfaForm newDevice={newDevice} />
      </CardContent>
    </Card>
  )
}
