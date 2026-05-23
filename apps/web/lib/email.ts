import { Resend } from "resend"

const FROM = process.env.EMAIL_FROM ?? "EduCore Africa <noreply@educore.africa>"

function client() {
  return new Resend(process.env.RESEND_API_KEY)
}

export type SendEmailArgs = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export async function sendEmail(args: SendEmailArgs) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — would have sent:", args.subject, "to", args.to)
    return { ok: false as const, error: "Email provider not configured" }
  }
  try {
    const data = await client().emails.send({
      from: FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: args.replyTo,
    })
    return { ok: true as const, data }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown email failure"
    console.error("[email] failed", error)
    return { ok: false as const, error }
  }
}

export function welcomeEmailHtml(opts: {
  schoolName: string
  adminName: string
  loginUrl: string
}) {
  return `
  <div style="font-family: ui-sans-serif, system-ui; max-width: 560px; margin: 0 auto; padding: 24px;">
    <h1 style="color:#0f172a;">Welcome to EduCore Africa, ${opts.adminName}!</h1>
    <p>Your school <strong>${opts.schoolName}</strong> is now live on EduCore.</p>
    <p>Sign in to start adding staff, students, and class structure:</p>
    <p>
      <a href="${opts.loginUrl}"
         style="background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block;">
        Open dashboard
      </a>
    </p>
    <p style="color:#64748b;font-size:14px;">If you didn't create this account, please ignore this email.</p>
  </div>`
}

export function otpEmailHtml(otp: string) {
  return `
  <div style="font-family: ui-sans-serif, system-ui; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h2 style="color:#0f172a;">Your verification code</h2>
    <p style="font-size:32px;letter-spacing:6px;font-weight:700;">${otp}</p>
    <p style="color:#64748b;">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
  </div>`
}
