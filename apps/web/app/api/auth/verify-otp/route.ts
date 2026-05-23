import { NextResponse } from "next/server"
import { z } from "zod"
import { verifyOtp } from "@/lib/otp"

export const runtime = "nodejs"

const bodySchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/),
  purpose: z.enum(["register", "reset-password", "mfa"]),
})

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 })
  }
  const { email, otp, purpose } = parsed.data

  const result = await verifyOtp({ purpose, subject: email, otp })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
