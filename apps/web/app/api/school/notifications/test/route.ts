import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSchoolAdmin } from "@/lib/guard"
import { sendSms } from "@/lib/sms"
import { sendEmail } from "@/lib/email"

export const runtime = "nodejs"

const schema = z.object({
  channel: z.enum(["sms", "email"]),
  target: z.string().min(3).max(200),
})

export async function POST(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 422 })

  if (parsed.data.channel === "sms") {
    const r = await sendSms(parsed.data.target, "EduCore test message — your SMS channel is working.")
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })
    return NextResponse.json({ ok: true })
  }

  const r = await sendEmail({
    to: parsed.data.target,
    subject: "EduCore test email",
    html: `<p>This is a test message from EduCore — your email channel is working.</p>`,
    text: "This is a test message from EduCore — your email channel is working.",
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
