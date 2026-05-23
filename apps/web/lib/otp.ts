import bcrypt from "bcryptjs"
import { redis } from "@/lib/redis"
import { sendSms } from "@/lib/sms"
import { sendEmail, otpEmailHtml } from "@/lib/email"

const TTL_SECONDS = 60 * 10 // 10 minutes
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN = 60 // seconds

export type OtpPurpose = "register" | "reset-password" | "mfa"

const key = (purpose: OtpPurpose, subject: string) => `otp:${purpose}:${subject.toLowerCase()}`
const cooldownKey = (purpose: OtpPurpose, subject: string) =>
  `otp:cooldown:${purpose}:${subject.toLowerCase()}`
const attemptsKey = (purpose: OtpPurpose, subject: string) =>
  `otp:attempts:${purpose}:${subject.toLowerCase()}`

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function issueOtp(opts: {
  purpose: OtpPurpose
  email?: string
  phone?: string
}) {
  if (!opts.email && !opts.phone) {
    throw new Error("issueOtp requires email or phone")
  }
  const subject = opts.email ?? opts.phone!
  const cooldown = await redis.get(cooldownKey(opts.purpose, subject))
  if (cooldown) {
    return { ok: false as const, error: "Please wait before requesting another code" }
  }

  const otp = generateOtp()
  const hash = await bcrypt.hash(otp, 10)
  await redis.set(key(opts.purpose, subject), hash, "EX", TTL_SECONDS)
  await redis.set(cooldownKey(opts.purpose, subject), "1", "EX", RESEND_COOLDOWN)
  await redis.del(attemptsKey(opts.purpose, subject))

  const message = `Your EduCore verification code is ${otp}. It expires in 10 minutes.`

  if (opts.phone) await sendSms(opts.phone, message)
  if (opts.email) {
    await sendEmail({
      to: opts.email,
      subject: "Your EduCore verification code",
      html: otpEmailHtml(otp),
      text: message,
    })
  }

  return { ok: true as const, devOtp: process.env.NODE_ENV !== "production" ? otp : undefined }
}

export async function verifyOtp(opts: { purpose: OtpPurpose; subject: string; otp: string }) {
  const k = key(opts.purpose, opts.subject)
  const stored = await redis.get(k)
  if (!stored) return { ok: false as const, error: "Code expired or not requested" }

  const ak = attemptsKey(opts.purpose, opts.subject)
  const attempts = Number(await redis.get(ak)) || 0
  if (attempts >= MAX_ATTEMPTS) {
    await redis.del(k)
    return { ok: false as const, error: "Too many attempts. Request a new code." }
  }

  const match = await bcrypt.compare(opts.otp, stored)
  if (!match) {
    await redis.incr(ak)
    await redis.expire(ak, TTL_SECONDS)
    return { ok: false as const, error: "Invalid code" }
  }

  await redis.del(k)
  await redis.del(ak)
  return { ok: true as const }
}
