import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"
import {
  gradeTemplateConfigSchema,
  midtermTemplateConfigSchema,
} from "@/lib/report-template"

export const runtime = "nodejs"

const KINDS = ["GRADE", "MIDTERM"] as const

const createSchema = z
  .object({
    kind: z.enum(KINDS),
    name: z.string().trim().min(2).max(80),
    curriculumId: z.string().trim().min(1).nullable().optional(),
    isDefault: z.boolean().optional(),
    config: z.unknown(),
  })
  .superRefine((v, ctx) => {
    const schema =
      v.kind === "GRADE" ? gradeTemplateConfigSchema : midtermTemplateConfigSchema
    const parsed = schema.safeParse(v.config)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ["config", ...issue.path] })
      }
    }
  })

export async function GET(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const url = new URL(req.url)
  const kind = url.searchParams.get("kind")
  if (kind && !KINDS.includes(kind as "GRADE" | "MIDTERM")) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 422 })
  }

  const rows = await prisma.reportTemplate.findMany({
    where: {
      schoolId: g.session.user.schoolId,
      deletedAt: null,
      ...(kind ? { kind: kind as "GRADE" | "MIDTERM" } : {}),
    },
    orderBy: [{ kind: "asc" }, { isDefault: "desc" }, { name: "asc" }],
  })

  return NextResponse.json({
    ok: true,
    templates: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      curriculumId: r.curriculumId,
      isDefault: r.isDefault,
      config: r.config,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  })
}

export async function POST(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid",
        details: parsed.error.flatten(),
      },
      { status: 422 },
    )
  }
  const schoolId = g.session.user.schoolId
  const { kind, name, curriculumId, isDefault, config } = parsed.data

  if (curriculumId) {
    const cur = await prisma.curriculum.findFirst({
      where: { id: curriculumId, schoolId, deletedAt: null },
    })
    if (!cur) return NextResponse.json({ error: "Curriculum not found" }, { status: 422 })
  }

  // Name collision check (unique on (schoolId, kind, name)).
  const collision = await prisma.reportTemplate.findFirst({
    where: { schoolId, kind, name, deletedAt: null },
  })
  if (collision) {
    return NextResponse.json({ error: "Template name already exists" }, { status: 409 })
  }

  // First template for this (kind, curriculumId) — auto-default.
  const peers = await prisma.reportTemplate.count({
    where: {
      schoolId,
      kind,
      curriculumId: curriculumId ?? null,
      deletedAt: null,
    },
  })
  const wantDefault = isDefault ?? peers === 0

  const created = await prisma.$transaction(async (tx) => {
    if (wantDefault) {
      await tx.reportTemplate.updateMany({
        where: {
          schoolId,
          kind,
          curriculumId: curriculumId ?? null,
          isDefault: true,
          deletedAt: null,
        },
        data: { isDefault: false },
      })
    }
    return tx.reportTemplate.create({
      data: {
        schoolId,
        kind,
        name,
        curriculumId: curriculumId ?? null,
        isDefault: wantDefault,
        config: config as object,
      },
    })
  })

  return NextResponse.json({ ok: true, id: created.id })
}
