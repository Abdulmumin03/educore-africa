import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"
import {
  gradeTemplateConfigSchema,
  midtermTemplateConfigSchema,
} from "@/lib/report-template"

export const runtime = "nodejs"

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    curriculumId: z.string().trim().min(1).nullable().optional(),
    isDefault: z.boolean().optional(),
    config: z.unknown().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" })

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid" },
      { status: 422 },
    )
  }
  const schoolId = g.session.user.schoolId

  const existing = await prisma.reportTemplate.findFirst({
    where: { id: params.id, schoolId, deletedAt: null },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (parsed.data.name && parsed.data.name !== existing.name) {
    const collision = await prisma.reportTemplate.findFirst({
      where: {
        schoolId,
        kind: existing.kind,
        name: parsed.data.name,
        deletedAt: null,
        NOT: { id: existing.id },
      },
    })
    if (collision) {
      return NextResponse.json({ error: "Template name already exists" }, { status: 409 })
    }
  }

  if (parsed.data.config !== undefined) {
    const schema =
      existing.kind === "GRADE" ? gradeTemplateConfigSchema : midtermTemplateConfigSchema
    const ok = schema.safeParse(parsed.data.config)
    if (!ok.success) {
      return NextResponse.json(
        { error: ok.error.issues[0]?.message ?? "Invalid config" },
        { status: 422 },
      )
    }
  }

  if (parsed.data.curriculumId !== undefined && parsed.data.curriculumId !== null) {
    const cur = await prisma.curriculum.findFirst({
      where: { id: parsed.data.curriculumId, schoolId, deletedAt: null },
    })
    if (!cur) return NextResponse.json({ error: "Curriculum not found" }, { status: 422 })
  }

  const nextCurriculumId =
    parsed.data.curriculumId === undefined
      ? existing.curriculumId
      : parsed.data.curriculumId

  // Demoting the only default in its (kind, curriculumId) bucket — refuse.
  if (parsed.data.isDefault === false && existing.isDefault) {
    return NextResponse.json(
      { error: "Promote another template to default first" },
      { status: 409 },
    )
  }

  await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault === true && !existing.isDefault) {
      await tx.reportTemplate.updateMany({
        where: {
          schoolId,
          kind: existing.kind,
          curriculumId: nextCurriculumId,
          isDefault: true,
          deletedAt: null,
          NOT: { id: existing.id },
        },
        data: { isDefault: false },
      })
    }
    await tx.reportTemplate.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.curriculumId !== undefined
          ? { curriculumId: parsed.data.curriculumId }
          : {}),
        ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}),
        ...(parsed.data.config !== undefined ? { config: parsed.data.config as object } : {}),
      },
    })
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const existing = await prisma.reportTemplate.findFirst({
    where: { id: params.id, schoolId: g.session.user.schoolId, deletedAt: null },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (existing.isDefault) {
    // Can't delete the default unless another template exists to take over.
    const peers = await prisma.reportTemplate.count({
      where: {
        schoolId: g.session.user.schoolId,
        kind: existing.kind,
        curriculumId: existing.curriculumId,
        deletedAt: null,
        NOT: { id: existing.id },
      },
    })
    if (peers === 0) {
      // Allow deleting the sole row — the resolver falls back to the builtin
      // default so no rendering breaks.
      // (Same as having zero templates.)
    } else {
      return NextResponse.json(
        { error: "Promote another template to default first" },
        { status: 409 },
      )
    }
  }

  await prisma.reportTemplate.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
