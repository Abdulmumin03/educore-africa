import { NextResponse } from "next/server"

import { AUTH_ACTIONS, auditLog } from "@/lib/audit"
import { clientIp } from "@/lib/ip"

export const dynamic = "force-dynamic"

// Middleware rewrites here when an address fails the global allowlist. The
// block was already decided on the edge; this route exists so the attempt is
// recorded (Prisma is not available in the edge runtime) and so the caller
// gets the documented body.
async function handle(request: Request) {
  const ipAddress = clientIp(request.headers)
  const from = request.headers.get("x-blocked-path") ?? "unknown"

  await auditLog({
    userId: null,
    action: AUTH_ACTIONS.IP_BLOCKED,
    target: `ip:${ipAddress}`,
    targetType: "system",
    ipAddress,
    details: {
      path: from,
      userAgent: request.headers.get("user-agent")?.slice(0, 240) ?? null,
      stage: "edge",
    },
  })

  return NextResponse.json({ error: "Access denied: IP not allowed" }, { status: 403 })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
