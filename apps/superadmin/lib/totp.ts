import * as OTPAuth from "otpauth"
import QRCode from "qrcode"

const ISSUER = "EduCore Africa Console"

/** Fresh base32 secret for a new enrolment. Store on SuperAdminUser.totpSecret. */
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32
}

function totpFor(email: string, secret: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  })
}

/** otpauth:// URI for an authenticator app. */
export function totpUri(email: string, secret: string): string {
  return totpFor(email, secret).toString()
}

/** Data-URI QR code of the enrolment URI, ready for an <img src>. */
export async function totpQrDataUrl(email: string, secret: string): Promise<string> {
  return QRCode.toDataURL(totpUri(email, secret), { margin: 1, width: 240 })
}

/**
 * Verify a 6-digit code. `window: 1` accepts the neighbouring 30s steps so a
 * slightly skewed phone clock doesn't lock staff out.
 */
export function verifyTotp(email: string, secret: string, token: string): boolean {
  const cleaned = token.replace(/\s/g, "")
  if (!/^\d{6}$/.test(cleaned)) return false
  return totpFor(email, secret).validate({ token: cleaned, window: 1 }) !== null
}
