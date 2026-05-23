import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"
import {
  upsertFeeStructureSchema,
  copyFeeStructureSchema,
} from "@/lib/finance-schemas"

export const runtime = "nodejs"

/**
 * List the fee components for a (term, class) — used by the fee-structure UI
 * and by invoice generation.
 *
 *   ?academicYearId=  required
 *   &termId=          optional (null = whole-year structure)
 *   &classId=         optional (omit → all classes for the term)
 */
export async function GET(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const academicYearId = url.searchParams.get("academicYearId")
  const termId = url.searchParams.get("termId")
  const classId = url.searchParams.get("classId")
  if (!academicYearId)
    return NextResponse.json({ error: "academicYearId required" }, { status: 422 })

  const rows = await prisma.feeStructure.findMany({
    where: {
      schoolId: access.session.schoolId,
      academicYearId,
      deletedAt: null,
      ...(termId === null
        ? {}
        : termId === "null"
          ? { termId: null }
          : termId
            ? { termId }
            : {}),
      ...(classId ? { classId } : {}),
    },
    include: { class: { select: { id: true, name: true, level: true } } },
    orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
  })

  // Group by class for the UI.
  const byClass = new Map<
    string,
    {
      classId: string
      className: string
      total: number
      components: Array<{
        id: string
        name: string
        category: string
        amount: number
        isMandatory: boolean
        dueDate: string | null
      }>
    }
  >()
  for (const r of rows) {
    const key = r.classId
    if (!byClass.has(key)) {
      byClass.set(key, {
        classId: r.classId,
        className: r.class.name,
        total: 0,
        components: [],
      })
    }
    const bucket = byClass.get(key)!
    const amt = Number(r.amount)
    bucket.components.push({
      id: r.id,
      name: r.name,
      category: r.category,
      amount: amt,
      isMandatory: r.isMandatory,
      dueDate: r.dueDate?.toISOString() ?? null,
    })
    if (r.isMandatory) bucket.total += amt
  }

  return NextResponse.json({
    classes: Array.from(byClass.values()),
  })
}

/**
 * Replace the fee components for a (term, class). Components without an `id`
 * are created; supplied IDs are updated; pre-existing components NOT in the
 * payload are soft-deleted.
 */
export async function POST(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = upsertFeeStructureSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { academicYearId, termId, classId, components } = parsed.data

  // Verify these belong to this school.
  const [klass, year, term] = await Promise.all([
    prisma.class.findFirst({
      where: { id: classId, schoolId: access.session.schoolId, deletedAt: null },
      select: { id: true },
    }),
    prisma.academicYear.findFirst({
      where: { id: academicYearId, schoolId: access.session.schoolId, deletedAt: null },
      select: { id: true },
    }),
    termId
      ? prisma.term.findFirst({
          where: { id: termId, academicYear: { schoolId: access.session.schoolId } },
          select: { id: true },
        })
      : Promise.resolve(true),
  ])
  if (!klass || !year || (termId && !term)) {
    return NextResponse.json({ error: "Invalid class / year / term" }, { status: 422 })
  }

  const existing = await prisma.feeStructure.findMany({
    where: {
      schoolId: access.session.schoolId,
      academicYearId,
      classId,
      termId: termId ?? null,
      deletedAt: null,
    },
    select: { id: true },
  })
  const incomingIds = new Set(components.map((c) => c.id).filter(Boolean))
  const toDelete = existing.filter((e) => !incomingIds.has(e.id)).map((e) => e.id)

  await prisma.$transaction([
    ...(toDelete.length > 0
      ? [
          prisma.feeStructure.updateMany({
            where: { id: { in: toDelete } },
            data: { deletedAt: new Date() },
          }),
        ]
      : []),
    ...components.map((c) =>
      c.id
        ? prisma.feeStructure.update({
            where: { id: c.id },
            data: {
              name: c.name,
              category: c.category,
              amount: new Prisma.Decimal(c.amount),
              isMandatory: c.isMandatory,
              dueDate: c.dueDate ? new Date(c.dueDate) : null,
            },
          })
        : prisma.feeStructure.create({
            data: {
              schoolId: access.session.schoolId,
              academicYearId,
              termId: termId ?? null,
              classId,
              name: c.name,
              category: c.category,
              amount: new Prisma.Decimal(c.amount),
              isMandatory: c.isMandatory,
              dueDate: c.dueDate ? new Date(c.dueDate) : null,
            },
          }),
    ),
  ])

  return NextResponse.json({ ok: true, saved: components.length, removed: toDelete.length })
}

/**
 * Copy a fee structure from a source (year, term, class) to a target one,
 * optionally adjusting every component's amount by ±percent.
 */
export async function PUT(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = copyFeeStructureSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const data = parsed.data

  const source = await prisma.feeStructure.findMany({
    where: {
      schoolId: access.session.schoolId,
      academicYearId: data.fromAcademicYearId,
      classId: data.fromClassId,
      termId: data.fromTermId ?? null,
      deletedAt: null,
    },
  })
  if (source.length === 0) {
    return NextResponse.json({ error: "Source structure is empty" }, { status: 422 })
  }

  const multiplier = 1 + (data.adjustPercent ?? 0) / 100

  // Soft-delete any existing target components first to avoid unique-constraint conflicts.
  const existing = await prisma.feeStructure.findMany({
    where: {
      schoolId: access.session.schoolId,
      academicYearId: data.toAcademicYearId,
      classId: data.toClassId,
      termId: data.toTermId ?? null,
      deletedAt: null,
    },
    select: { id: true },
  })

  await prisma.$transaction([
    ...(existing.length > 0
      ? [
          prisma.feeStructure.updateMany({
            where: { id: { in: existing.map((e) => e.id) } },
            data: { deletedAt: new Date() },
          }),
        ]
      : []),
    prisma.feeStructure.createMany({
      data: source.map((s) => ({
        schoolId: access.session.schoolId,
        academicYearId: data.toAcademicYearId,
        termId: data.toTermId ?? null,
        classId: data.toClassId,
        name: s.name,
        category: s.category,
        amount: new Prisma.Decimal(Math.round(Number(s.amount) * multiplier * 100) / 100),
        isMandatory: s.isMandatory,
        dueDate: s.dueDate,
      })),
    }),
  ])

  return NextResponse.json({ ok: true, copied: source.length })
}
