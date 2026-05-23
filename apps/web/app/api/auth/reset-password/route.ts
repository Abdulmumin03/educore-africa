import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { resetPasswordSchema } from "@/lib/auth-schemas"
import { verifyOtp } from "@/lib/otp"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const parsed = resetPasswordSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { email, otp, password } = parsed.data

  const otpResult = await verifyOtp({ purpose: "reset-password", subject: email, otp })
  if (!otpResult.ok) {
    return NextResponse.json({ error: otpResult.error }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.isActive || user.deletedAt) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  })

  await prisma.auditLog.create({
    data: {
      schoolId: user.schoolId,
      userId: user.id,
      action: "PASSWORD_RESET",
      entityType: "User",
      entityId: user.id,
    },
  })

  return NextResponse.json({ ok: true })
}
