import { NextResponse } from "next/server"

import {
  IMPERSONATION_COOKIE,
  impersonationCookieOptions,
  redeemToken,
} from "@/lib/impersonation"

export const dynamic = "force-dynamic"

/**
 * Landing point for a support session started in the Super Admin Console.
 *
 * The token arrives once, in the query string, and is immediately swapped for
 * an httpOnly cookie so it never sits in the address bar or in history beyond
 * this redirect.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")
  if (!token) {
    return NextResponse.redirect(new URL("/auth/login?impersonation=missing", request.url))
  }

  const grant = await redeemToken(token)
  if (!grant) {
    return NextResponse.redirect(new URL("/auth/login?impersonation=expired", request.url))
  }

  const response = NextResponse.redirect(new URL("/dashboard", request.url))
  response.cookies.set(IMPERSONATION_COOKIE, token, impersonationCookieOptions(grant.expiresAt))
  return response
}
