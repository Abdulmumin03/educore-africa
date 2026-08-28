import { NextResponse } from "next/server"

import { categoriseTicket } from "@/lib/growth-ai"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/**
 * Triage a ticket's title and description.
 *
 * Returns a suggestion — it does NOT write to the ticket. The caller decides
 * whether to apply it, and the reply is a draft an agent edits and sends. A
 * model that could set a CRITICAL priority unattended would be setting an SLA
 * clock unattended, and that clock is what the support board is judged on.
 */
export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const title = typeof body.title === "string" ? body.title.trim() : ""
  const description = typeof body.description === "string" ? body.description.trim() : ""

  if (!title && !description) {
    return NextResponse.json({ error: "Give a title or a description to triage." }, { status: 400 })
  }

  const result = await categoriseTicket({
    title,
    description,
    school: typeof body.school === "string" ? body.school : null,
  })

  return NextResponse.json({
    ...result,
    notice: "A suggestion only — nothing was applied to the ticket and no reply was sent.",
  })
}
