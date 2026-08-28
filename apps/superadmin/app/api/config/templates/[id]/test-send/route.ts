import { NextResponse } from "next/server"

import { auditLog, auditTarget } from "@/lib/audit"
import { prisma } from "@/lib/db"
import { requireApiSession } from "@/lib/session-guard"
import { SAMPLE_VALUES, renderTemplate } from "@/lib/templates"

export const dynamic = "force-dynamic"

/**
 * Send one test message to the signed-in operator.
 *
 * Email goes through Resend, which the console reaches over plain HTTP rather
 * than adding a second SDK. When RESEND_API_KEY is absent nothing is sent and
 * the response says `sent: false` with the reason — the same rule the refund
 * gateway follows. A "sent!" toast over a message that never left would be
 * the worst possible outcome here.
 *
 * SMS test sends are NOT offered: the school app owns the Africa's Talking
 * credit balance, and spending a school's credits to preview console copy is
 * not the console's to do.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    // Falls back to the saved template.
  }

  const template = await prisma.messageTemplate.findUnique({
    where: { id: params.id },
    select: { id: true, kind: true, key: true, label: true, subject: true, body: true },
  })
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 })

  if (template.kind === "SMS") {
    return NextResponse.json(
      {
        sent: false,
        reason:
          "SMS test sends are not available from the console — the sender and the credit balance belong to the school app. Use the preview panel instead.",
      },
      { status: 400 },
    )
  }

  const draftBody = typeof body.body === "string" ? body.body : template.body
  const draftSubject = typeof body.subject === "string" ? body.subject : (template.subject ?? "")
  const subject = `[TEST] ${renderTemplate(draftSubject, SAMPLE_VALUES)}`
  const html = renderTemplate(draftBody, SAMPLE_VALUES)

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? "EduCore Africa <noreply@educore.africa>"

  if (!apiKey) {
    return NextResponse.json({
      sent: false,
      to: guard.user.email,
      subject,
      reason: "RESEND_API_KEY is not set, so nothing was sent. The rendered message is below.",
      preview: { subject, html },
    })
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [guard.user.email], subject, html }),
    })

    if (!response.ok) {
      const detail = await response.text()
      return NextResponse.json(
        {
          sent: false,
          to: guard.user.email,
          reason: `Resend refused the message (HTTP ${response.status}). ${detail.slice(0, 200)}`,
          preview: { subject, html },
        },
        { status: 502 },
      )
    }

    await auditLog({
      userId: guard.user.id,
      action: "config.template.test-send",
      target: auditTarget("config", `${template.kind.toLowerCase()}:${template.key}`),
      targetType: "config",
      ipAddress: guard.ipAddress,
      details: { to: guard.user.email, key: template.key },
    })

    return NextResponse.json({ sent: true, to: guard.user.email, subject })
  } catch (error) {
    return NextResponse.json(
      {
        sent: false,
        to: guard.user.email,
        reason: error instanceof Error ? error.message : "Could not reach Resend.",
        preview: { subject, html },
      },
      { status: 502 },
    )
  }
}
