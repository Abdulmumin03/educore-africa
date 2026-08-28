import { NextResponse } from "next/server"

import { resolveEnrolmentContext } from "@/lib/enrolment-context"
import { generateTotpSecret, totpQrDataUrl, totpUri } from "@/lib/totp"
import { storePendingSecret } from "@/lib/totp-enrolment"

export const dynamic = "force-dynamic"

// Step 1 of enrolment: mint a candidate secret and render it as a QR code.
// Nothing is written to the user row until /totp/confirm proves the code
// works — see lib/totp-enrolment for why the candidate lives in a cookie.
export async function POST(request: Request) {
  const context = await resolveEnrolmentContext(request.headers)
  if (!context) {
    return NextResponse.json({ error: "Not signed in", next: "/login" }, { status: 401 })
  }

  const secret = generateTotpSecret()
  storePendingSecret(context.userId, secret)

  return NextResponse.json({
    secret, // shown as the manual-entry fallback
    uri: totpUri(context.email, secret),
    qrDataUrl: await totpQrDataUrl(context.email, secret),
    email: context.email,
    forced: context.forced,
  })
}
