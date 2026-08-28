import { NextResponse } from "next/server"

import { getUserDetail } from "@/lib/users"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const user = await getUserDetail(params.id)
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  return NextResponse.json({ user })
}
