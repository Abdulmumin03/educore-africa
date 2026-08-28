import { NextResponse } from "next/server"

import { IMPERSONATION_COOKIE } from "@/lib/impersonation"

export const dynamic = "force-dynamic"

/**
 * Leave a support session. Only clears the cookie on this browser — ending
 * the grant itself is done from the console, which also writes the
 * IMPERSONATION_END audit entry.
 */
function leave(request: Request) {
  const response = NextResponse.redirect(new URL("/auth/login?impersonation=ended", request.url))
  response.cookies.set(IMPERSONATION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  })
  return response
}

export const GET = leave
export const POST = leave
