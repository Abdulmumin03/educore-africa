import { NextResponse } from "next/server"

import { runReport, type Filter } from "@/lib/reports"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

/** First ten rows plus the true match count, so "Preview" is not a lie by omission. */
export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const result = await runReport(
    {
      source: typeof body.source === "string" ? body.source : "",
      fields: Array.isArray(body.fields)
        ? body.fields.filter((value): value is string => typeof value === "string")
        : [],
      filters: Array.isArray(body.filters) ? (body.filters as Filter[]) : [],
      sortField: typeof body.sortField === "string" ? body.sortField : null,
      sortDir: body.sortDir === "asc" ? "asc" : "desc",
    },
    { previewRows: 10 },
  )

  if ("error" in result) return NextResponse.json(result, { status: 400 })
  return NextResponse.json(result)
}
