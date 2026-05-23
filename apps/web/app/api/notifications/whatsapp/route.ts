import { NextResponse } from "next/server"
import { z } from "zod"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import {
  sendWhatsAppMessage,
  WHATSAPP_TEMPLATES,
  type WhatsAppTemplateName,
} from "@/lib/whatsapp"

export const runtime = "nodejs"

const SEND_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "BURSAR"]

const bodySchema = z.object({
  to: z.string().trim().min(7).max(20),
  templateName: z.enum(["fee_reminder", "absence_alert", "result_ready", "announcement"]),
  params: z.array(z.string()).min(0).max(20),
})

export async function GET() {
  return NextResponse.json({
    templates: Object.entries(WHATSAPP_TEMPLATES).map(([name, spec]) => ({
      name,
      paramCount: spec.paramCount,
      description: spec.description,
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!SEND_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const { to, templateName, params } = parsed.data
  const result = await sendWhatsAppMessage(to, templateName as WhatsAppTemplateName, params)

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
  }

  return NextResponse.json({ ok: true, messageId: result.messageId })
}
