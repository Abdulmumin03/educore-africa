import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

// AES-256-GCM at rest for TOTP seeds. A leaked database dump alone must not
// let anyone generate valid codes — the key lives only in SUPERADMIN_SECRET.
//
// Format: enc:v1:<iv-b64>:<tag-b64>:<ciphertext-b64>

const PREFIX = "enc:v1:"

function key(): Buffer {
  const secret = process.env.SUPERADMIN_SECRET
  if (!secret) throw new Error("SUPERADMIN_SECRET is not set")
  // sha256 gives us the exact 32 bytes AES-256 wants from an arbitrary secret.
  return createHash("sha256").update(secret).digest()
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])

  return [
    PREFIX + iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":")
}

/**
 * Decrypt a value written by encryptSecret.
 *
 * Anything without the prefix is returned unchanged: accounts enrolled before
 * SA-01 stored the raw base32 seed, and they must keep working until they
 * re-enrol. Returns null when the payload is corrupt or the key has changed.
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith(PREFIX)) return value

  const [ivPart, tagPart, dataPart] = value.slice(PREFIX.length).split(":")
  if (!ivPart || !tagPart || !dataPart) return null

  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivPart, "base64"))
    decipher.setAuthTag(Buffer.from(tagPart, "base64"))
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    return null
  }
}

export function isEncrypted(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(PREFIX))
}

/** sha256, hex. Used for opaque tokens we only ever need to look up by value. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
