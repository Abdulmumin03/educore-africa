import { NextResponse } from "next/server"

import { isUserRole, searchUsers } from "@/lib/users"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const params = new URL(request.url).searchParams
  const role = params.get("role")
  const status = params.get("status")

  return NextResponse.json(
    await searchUsers({
      query: params.get("q")?.trim() || undefined,
      role: role && isUserRole(role) ? role : undefined,
      schoolId: params.get("schoolId") || undefined,
      status: status === "active" || status === "disabled" ? status : "all",
      page: Number(params.get("page") ?? 1) || 1,
      limit: Number(params.get("limit") ?? 25) || 25,
    }),
  )
}
