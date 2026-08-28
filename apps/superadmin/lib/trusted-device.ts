import { randomBytes } from "node:crypto"

import { prisma } from "@/lib/db"
import { sha256 } from "@/lib/crypto"

// "Trust this device for 30 days" — the browser holds an opaque token, the
// database holds only its sha256. Trust is per user AND per device: the row
// is matched on (userId, tokenHash), so a stolen cookie is useless without
// the matching password.
export const TRUSTED_DEVICE_COOKIE = "educore-sa.trusted-device"
export const TRUST_DAYS = 30

export function trustedDeviceCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  }
}

/** Coarse label for the security screen — never the full UA string. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ""
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Unknown browser"

  const platform =
    /Windows/.test(ua) ? "Windows"
    : /Macintosh|Mac OS/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Linux/.test(ua) ? "Linux"
    : "Unknown OS"

  return `${browser} on ${platform}`
}

export type IssuedDevice = { token: string; maxAgeSeconds: number }

export async function trustDevice(opts: {
  userId: string
  ipAddress: string
  userAgent: string | null
}): Promise<IssuedDevice> {
  const token = randomBytes(32).toString("hex")
  const maxAgeSeconds = TRUST_DAYS * 24 * 60 * 60

  await prisma.superAdminTrustedDevice.create({
    data: {
      userId: opts.userId,
      tokenHash: sha256(token),
      label: deviceLabel(opts.userAgent),
      ipAddress: opts.ipAddress,
      expiresAt: new Date(Date.now() + maxAgeSeconds * 1000),
    },
  })

  return { token, maxAgeSeconds }
}

/**
 * Is this token a live trust record for this user? Touches lastUsedAt so the
 * security screen can show stale devices.
 */
export async function isDeviceTrusted(userId: string, token: string | undefined): Promise<boolean> {
  if (!token) return false

  const row = await prisma.superAdminTrustedDevice.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, userId: true, expiresAt: true },
  })

  if (!row || row.userId !== userId || row.expiresAt <= new Date()) return false

  await prisma.superAdminTrustedDevice.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  })

  return true
}

export async function forgetDevice(token: string | undefined): Promise<void> {
  if (!token) return
  await prisma.superAdminTrustedDevice.deleteMany({ where: { tokenHash: sha256(token) } })
}

/** Called when TOTP is re-enrolled — every previous trust decision is void. */
export async function forgetAllDevices(userId: string): Promise<void> {
  await prisma.superAdminTrustedDevice.deleteMany({ where: { userId } })
}
