import { NextResponse } from "next/server"
import { z } from "zod"
import { issueOtp, type OtpPurpose } from "@/lib/otp"
import { prisma } from "@/lib/db"

export const runtime = "nodejs"

const bodySchema = z.object({
  email: z.string().email(),
  purpose: z.enum(["register", "reset-password", "mfa"]),
})

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 })
  }
  const { email, purpose } = parsed.data

  // For reset-password and mfa, only issue if the user actually exists —
  // but respond identically either way to avoid leaking which emails are registered.
  if (purpose === "reset-password" || purpose === "mfa") {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.isActive || user.deletedAt) {
      return NextResponse.json({ ok: true })
    }
    const result = await issueOtp({
      purpose: purpose as OtpPurpose,
      email,
      phone: user.phone ?? undefined,
    })
    return NextResponse.json({ ok: result.ok, devOtp: result.ok ? result.devOtp : undefined })
  }

  const result = await issueOtp({ purpose, email })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 429 })
  }
  return NextResponse.json({ ok: true, devOtp: result.devOtp })
}
