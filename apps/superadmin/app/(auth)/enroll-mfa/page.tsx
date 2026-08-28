import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MFA_COOKIE, verifyChallenge } from "@/lib/auth-challenge"
import { TotpEnrolment } from "@/components/shared/totp-enrolment"

export const metadata: Metadata = { title: "Set up two-factor" }

// Forced enrolment: an account with totpEnabled = false cannot get a session
// at all (lib/auth refuses), so this is the only way in for a new admin.
export default function EnrollMfaPage() {
  if (!verifyChallenge(cookies().get(MFA_COOKIE)?.value, "enroll")) redirect("/login")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Set up two-factor authentication</CardTitle>
        <CardDescription>
          Required before you can reach the console. Takes about a minute.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TotpEnrolment forced />
      </CardContent>
    </Card>
  )
}
