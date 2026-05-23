import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const schema = z.object({
  name: z.string().trim().min(2),
  motto: z.string().max(120).nullable().optional(),
  slogan: z.string().max(160).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  state: z.string().max(60).nullable().optional(),
  city: z.string().max(60).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  website: z.string().url().nullable().optional().or(z.literal("")),
  accreditationNumber: z.string().max(60).nullable().optional(),
  ministryRegNumber: z.string().max(60).nullable().optional(),
  logoUrl: z.string().url().nullable().optional().or(z.literal("")),
})

function nullify(v: string | null | undefined) {
  return v === "" || v === undefined ? null : v
}

export async function PATCH(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })
  }
  const data = parsed.data

  const updated = await prisma.school.update({
    where: { id: g.session.user.schoolId },
    data: {
      name: data.name,
      motto: nullify(data.motto),
      slogan: nullify(data.slogan),
      address: nullify(data.address),
      state: nullify(data.state),
      city: nullify(data.city),
      phone: nullify(data.phone),
      email: nullify(data.email),
      website: nullify(data.website),
      accreditationNumber: nullify(data.accreditationNumber),
      ministryRegNumber: nullify(data.ministryRegNumber),
      logoUrl: nullify(data.logoUrl),
    },
    select: { id: true, name: true, slug: true, logoUrl: true },
  })

  await prisma.auditLog.create({
    data: {
      schoolId: g.session.user.schoolId,
      userId: g.session.user.id,
      action: "SCHOOL_PROFILE_UPDATED",
      entityType: "School",
      entityId: updated.id,
    },
  })

  return NextResponse.json({ ok: true, school: updated })
}
