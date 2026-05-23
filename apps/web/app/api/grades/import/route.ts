import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { resolveGradeAccess, teacherCanGrade } from "@/lib/grade-access"
import { getGradingConfig } from "@/lib/grade-config"

export const runtime = "nodejs"

const importSchema = z.object({
  classId: z.string().cuid(),
  sectionId: z.string().cuid(),
  termId: z.string().cuid(),
  subjectId: z.string().cuid(),
  csv: z.string().min(1).max(2_000_000), // ~2MB cap
  commit: z.boolean().default(false), // false = preview only
})

type RowResult =
  | {
      ok: true
      admissionNumber: string
      studentId: string
      caComponents: Record<string, number>
      examScore: number
      teacherRemark: string | null
    }
  | { ok: false; admissionNumber: string; reason: string }

function parseCsv(csv: string): { header: string[]; rows: string[][] } {
  // Minimal CSV parser: handles quoted cells + escaped quotes. Doesn't support
  // multi-line cells (unusual in grade exports).
  const lines = csv.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim().length > 0)
  const parseLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur)
        cur = ""
      } else {
        cur += ch
      }
    }
    out.push(cur)
    return out
  }
  const [head, ...rest] = lines
  return { header: parseLine(head).map((h) => h.trim()), rows: rest.map(parseLine) }
}

/**
 * CSV bulk import.
 *
 *   commit=false → returns valid/invalid preview (no DB writes)
 *   commit=true  → writes valid rows + logs a GradeImport audit row
 */
export async function POST(req: Request) {
  const access = await resolveGradeAccess()
  if (!access.ok) return access.response
  if (!access.canWrite) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = importSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { classId, sectionId, termId, subjectId, csv, commit } = parsed.data

  const allowed = await teacherCanGrade({
    schoolId: access.session.schoolId,
    staffId: access.teacherStaffId,
    subjectId,
    sectionId,
    isPrivileged: access.isPrivileged,
  })
  if (!allowed) return NextResponse.json({ error: "Not assigned to this subject" }, { status: 403 })

  const config = await getGradingConfig(access.session.schoolId)
  const { header, rows } = parseCsv(csv)

  const admIdx = header.findIndex((h) => h.toLowerCase() === "admission_no")
  if (admIdx === -1) {
    return NextResponse.json(
      { error: "CSV must include an 'admission_no' column" },
      { status: 422 },
    )
  }
  const componentIdx = config.caComponents.map((name) => ({
    name,
    idx: header.findIndex((h) => h === name),
  }))
  const examIdx = header.findIndex((h) => h.toLowerCase() === "exam")
  const remarkIdx = header.findIndex((h) => h.toLowerCase() === "teacher_remark")

  // Map admission numbers to studentIds for the enrolled roster.
  const enrollments = await prisma.enrollment.findMany({
    where: { sectionId, isActive: true, deletedAt: null },
    include: { student: { select: { id: true, admissionNumber: true } } },
  })
  const byAdm = new Map(enrollments.map((e) => [e.student.admissionNumber, e.student.id]))

  const results: RowResult[] = rows.map((cells) => {
    const admissionNumber = (cells[admIdx] ?? "").trim()
    if (!admissionNumber) return { ok: false, admissionNumber: "(empty)", reason: "missing admission_no" }
    const studentId = byAdm.get(admissionNumber)
    if (!studentId) {
      return { ok: false, admissionNumber, reason: "not enrolled in this section" }
    }

    const caComponents: Record<string, number> = {}
    for (const { name, idx } of componentIdx) {
      if (idx === -1) continue
      const raw = (cells[idx] ?? "").trim()
      if (!raw) continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return { ok: false, admissionNumber, reason: `${name}: invalid number "${raw}"` }
      }
      caComponents[name] = n
    }

    let examScore = 0
    if (examIdx !== -1) {
      const raw = (cells[examIdx] ?? "").trim()
      if (raw) {
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return { ok: false, admissionNumber, reason: `exam: invalid number "${raw}"` }
        }
        examScore = n
      }
    }

    const teacherRemark = remarkIdx === -1 ? null : (cells[remarkIdx] ?? "").trim() || null

    return { ok: true, admissionNumber, studentId, caComponents, examScore, teacherRemark }
  })

  const valid = results.filter((r): r is Extract<RowResult, { ok: true }> => r.ok)
  const invalid = results.filter((r): r is Extract<RowResult, { ok: false }> => !r.ok)

  if (!commit) {
    return NextResponse.json({
      ok: true,
      preview: true,
      counts: { total: results.length, valid: valid.length, invalid: invalid.length },
      valid,
      invalid,
    })
  }

  // Write valid rows via the existing POST /api/grades flow's transformer.
  const { letterGradeFor, totalCaFrom, computePositions } = await import("@/lib/grade-config")
  const recorderStaff = access.teacherStaffId

  await prisma.$transaction([
    ...valid.map((v) => {
      const caScore = totalCaFrom(v.caComponents, config.caComponents)
      const totalScore = Math.round((caScore + v.examScore) * 10) / 10
      const lg = letterGradeFor(totalScore, config.scale)
      return prisma.grade.upsert({
        where: {
          studentId_subjectId_termId: {
            studentId: v.studentId,
            subjectId,
            termId,
          },
        },
        create: {
          schoolId: access.session.schoolId,
          studentId: v.studentId,
          subjectId,
          termId,
          caComponents: v.caComponents,
          caScore,
          examScore: v.examScore,
          totalScore,
          letterGrade: lg?.grade ?? null,
          teacherRemark: v.teacherRemark,
          recordedById: recorderStaff,
        },
        update: {
          caComponents: v.caComponents,
          caScore,
          examScore: v.examScore,
          totalScore,
          letterGrade: lg?.grade ?? null,
          teacherRemark: v.teacherRemark,
          recordedById: recorderStaff,
        },
      })
    }),
    prisma.gradeImport.create({
      data: {
        schoolId: access.session.schoolId,
        classId,
        sectionId,
        subjectId,
        termId,
        importedById: access.session.userId,
        rowsAttempted: results.length,
        rowsImported: valid.length,
        errors: invalid.length > 0 ? invalid : undefined,
      },
    }),
  ])

  // Recompute positions for this subject/section.
  const allGrades = await prisma.grade.findMany({
    where: {
      schoolId: access.session.schoolId,
      subjectId,
      termId,
      deletedAt: null,
      student: {
        enrollments: { some: { sectionId, isActive: true, deletedAt: null } },
      },
    },
    select: { id: true, studentId: true, totalScore: true },
  })
  const positions = computePositions(allGrades)
  await prisma.$transaction(
    allGrades
      .map((g) => {
        const pos = positions.get(g.studentId)
        return pos === undefined
          ? null
          : prisma.grade.update({ where: { id: g.id }, data: { position: pos } })
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  )

  return NextResponse.json({
    ok: true,
    preview: false,
    counts: { total: results.length, valid: valid.length, invalid: invalid.length },
    invalid,
  })
}
