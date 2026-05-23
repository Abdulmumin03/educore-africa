import type Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/db"

/**
 * Ask EduCore is built on Anthropic tool use. Each tool is a curated, read-only
 * Prisma helper. Claude picks which tool to call with which arguments, then we
 * run the helper. New questions = new tool. NO raw SQL, NO mutations.
 */

export const ASK_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "count_students",
    description:
      "Count students in the school, optionally filtered by class name (case-insensitive substring) and/or status.",
    input_schema: {
      type: "object",
      properties: {
        className: {
          type: "string",
          description: "Substring match against class name, e.g. 'JSS 2' or 'SS'.",
        },
        status: {
          type: "string",
          enum: ["ACTIVE", "GRADUATED", "TRANSFERRED", "WITHDRAWN", "SUSPENDED", "DECEASED"],
        },
      },
    },
  },
  {
    name: "list_students_failing_subject",
    description:
      "List students whose total score in a given subject (and optionally a given term + class) is below a threshold.",
    input_schema: {
      type: "object",
      required: ["subject", "thresholdScore"],
      properties: {
        subject: { type: "string", description: "Subject name or code, case-insensitive substring." },
        thresholdScore: { type: "number", description: "0-100; e.g. 50 = pass mark." },
        className: { type: "string", description: "Optional class name substring." },
        termLabel: {
          type: "string",
          description:
            "Optional term label, e.g. '2025/2026 FIRST' (sessionName + term type). Omit for current term.",
        },
        limit: { type: "number", description: "Cap results, default 25, max 100." },
      },
    },
  },
  {
    name: "list_students_absent_more_than",
    description:
      "Students with strictly more than N absences within an optional date range (defaults to current term).",
    input_schema: {
      type: "object",
      required: ["minAbsences"],
      properties: {
        minAbsences: { type: "number", description: "Minimum number of absences (exclusive)." },
        fromDate: { type: "string", description: "ISO date for start of range, optional." },
        toDate: { type: "string", description: "ISO date for end of range, optional." },
        className: { type: "string", description: "Optional class name substring." },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "teacher_pass_rate_leaderboard",
    description:
      "For the current term, the pass rate (% of grades ≥ 50) per teacher across the subjects they recorded. Returns ranked list.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many top teachers to return, default 10." },
      },
    },
  },
  {
    name: "fees_outstanding",
    description:
      "Total fees outstanding (amount due minus amount paid, across all PENDING/PARTIAL/OVERDUE invoices), optionally filtered by class and/or term.",
    input_schema: {
      type: "object",
      properties: {
        className: { type: "string" },
        termLabel: { type: "string", description: "e.g. '2025/2026 FIRST'. Omit for current term." },
      },
    },
  },
  {
    name: "class_average_for_subject",
    description: "Class average % for a subject in the current term (or a named term).",
    input_schema: {
      type: "object",
      required: ["subject", "className"],
      properties: {
        subject: { type: "string" },
        className: { type: "string" },
        termLabel: { type: "string" },
      },
    },
  },
  {
    name: "list_overdue_invoices",
    description: "Outstanding invoices past due, sorted by most-overdue first.",
    input_schema: {
      type: "object",
      properties: {
        minDaysOverdue: { type: "number", description: "Default 1." },
        limit: { type: "number", description: "Default 20." },
      },
    },
  },
  {
    name: "list_at_risk_students",
    description:
      "Returns the most recent risk scores for students whose level matches the requested filter.",
    input_schema: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
        limit: { type: "number", description: "Default 25." },
      },
    },
  },
]

type ToolHandler<TInput> = (
  schoolId: string,
  input: TInput,
) => Promise<Record<string, unknown>>

async function resolveTerm(schoolId: string, label: string | undefined): Promise<{ id: string; label: string } | null> {
  if (!label) {
    const t = await prisma.term.findFirst({
      where: { isCurrent: true, academicYear: { schoolId } },
      include: { academicYear: { select: { name: true } } },
    })
    return t ? { id: t.id, label: `${t.academicYear.name} ${t.type}` } : null
  }
  const parts = label.trim().split(/\s+/)
  const last = parts[parts.length - 1].toUpperCase()
  const type = ["FIRST", "SECOND", "THIRD"].includes(last) ? last : null
  const session = parts.slice(0, -1).join(" ").trim() || parts.join(" ")
  const t = await prisma.term.findFirst({
    where: {
      academicYear: { schoolId, name: { contains: session, mode: "insensitive" } },
      ...(type ? { type: type as "FIRST" | "SECOND" | "THIRD" } : {}),
    },
    include: { academicYear: { select: { name: true } } },
  })
  return t ? { id: t.id, label: `${t.academicYear.name} ${t.type}` } : null
}

const handlers: Record<string, ToolHandler<Record<string, unknown>>> = {
  async count_students(schoolId, input) {
    const className = typeof input.className === "string" ? input.className : undefined
    const status = typeof input.status === "string" ? input.status : "ACTIVE"
    const total = await prisma.student.count({
      where: {
        schoolId,
        deletedAt: null,
        status: status as "ACTIVE" | "GRADUATED" | "TRANSFERRED" | "WITHDRAWN" | "SUSPENDED" | "DECEASED",
        ...(className
          ? {
              enrollments: {
                some: {
                  isActive: true,
                  deletedAt: null,
                  section: { class: { name: { contains: className, mode: "insensitive" } } },
                },
              },
            }
          : {}),
      },
    })
    return { total, filter: { className: className ?? null, status } }
  },

  async list_students_failing_subject(schoolId, input) {
    const subject = String(input.subject ?? "")
    const threshold = Number(input.thresholdScore ?? 50)
    const className = typeof input.className === "string" ? input.className : undefined
    const termLabel = typeof input.termLabel === "string" ? input.termLabel : undefined
    const limit = Math.min(100, Math.max(1, Number(input.limit ?? 25)))
    const term = await resolveTerm(schoolId, termLabel)
    if (!term) return { items: [], note: "No active term found." }

    const grades = await prisma.grade.findMany({
      where: {
        schoolId,
        termId: term.id,
        deletedAt: null,
        totalScore: { lt: threshold },
        subject: {
          OR: [
            { name: { contains: subject, mode: "insensitive" } },
            { code: { contains: subject, mode: "insensitive" } },
          ],
        },
        ...(className
          ? {
              student: {
                enrollments: {
                  some: {
                    isActive: true,
                    deletedAt: null,
                    section: { class: { name: { contains: className, mode: "insensitive" } } },
                  },
                },
              },
            }
          : {}),
      },
      orderBy: { totalScore: "asc" },
      take: limit,
      include: {
        student: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            enrollments: {
              where: { isActive: true, deletedAt: null },
              take: 1,
              include: { class: { select: { name: true } }, section: { select: { name: true } } },
            },
          },
        },
        subject: { select: { name: true, code: true } },
      },
    })
    return {
      term: term.label,
      count: grades.length,
      items: grades.map((g) => ({
        name: `${g.student.user.firstName} ${g.student.user.lastName}`,
        admissionNumber: g.student.admissionNumber,
        class: g.student.enrollments[0]?.class.name,
        section: g.student.enrollments[0]?.section.name,
        subject: g.subject.name,
        score: g.totalScore,
        letterGrade: g.letterGrade,
      })),
    }
  },

  async list_students_absent_more_than(schoolId, input) {
    const min = Number(input.minAbsences ?? 0)
    const className = typeof input.className === "string" ? input.className : undefined
    const limit = Math.min(100, Math.max(1, Number(input.limit ?? 25)))
    const from = typeof input.fromDate === "string" ? new Date(input.fromDate) : null
    const to = typeof input.toDate === "string" ? new Date(input.toDate) : null
    const term = await resolveTerm(schoolId, undefined)
    if (!from && !to && !term) return { items: [], note: "No active term found." }

    const where = {
      schoolId,
      deletedAt: null,
      status: "ABSENT" as const,
      ...(from || to
        ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : term
          ? { termId: term.id }
          : {}),
    }
    const grouped = await prisma.attendance.groupBy({
      by: ["studentId"],
      where,
      _count: { _all: true },
      having: { studentId: { _count: { gt: min } } },
      orderBy: { _count: { studentId: "desc" } },
      take: limit,
    })
    if (grouped.length === 0) return { count: 0, items: [] }

    const studentIds = grouped.map((g) => g.studentId)
    const students = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        ...(className
          ? {
              enrollments: {
                some: {
                  isActive: true,
                  deletedAt: null,
                  section: { class: { name: { contains: className, mode: "insensitive" } } },
                },
              },
            }
          : {}),
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
        enrollments: {
          where: { isActive: true, deletedAt: null },
          take: 1,
          include: { class: { select: { name: true } }, section: { select: { name: true } } },
        },
      },
    })
    const byId = new Map(students.map((s) => [s.id, s]))
    const items = grouped
      .map((g) => {
        const s = byId.get(g.studentId)
        if (!s) return null
        return {
          name: `${s.user.firstName} ${s.user.lastName}`,
          admissionNumber: s.admissionNumber,
          class: s.enrollments[0]?.class.name,
          section: s.enrollments[0]?.section.name,
          absences: g._count._all,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    return { count: items.length, items }
  },

  async teacher_pass_rate_leaderboard(schoolId, input) {
    const limit = Math.min(50, Math.max(1, Number(input.limit ?? 10)))
    const term = await resolveTerm(schoolId, undefined)
    if (!term) return { items: [], note: "No active term found." }

    const grades = await prisma.grade.findMany({
      where: {
        schoolId,
        termId: term.id,
        deletedAt: null,
        recordedById: { not: null },
      },
      select: {
        recordedById: true,
        totalScore: true,
        recordedBy: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    })
    type Agg = { name: string; total: number; passed: number }
    const map = new Map<string, Agg>()
    for (const g of grades) {
      if (!g.recordedById) continue
      const cur = map.get(g.recordedById) ?? {
        name: g.recordedBy ? `${g.recordedBy.user.firstName} ${g.recordedBy.user.lastName}` : g.recordedById,
        total: 0,
        passed: 0,
      }
      cur.total += 1
      if (g.totalScore >= 50) cur.passed += 1
      map.set(g.recordedById, cur)
    }
    const ranked = Array.from(map.values())
      .map((a) => ({ ...a, passRate: a.total > 0 ? Math.round((a.passed / a.total) * 100) : 0 }))
      .sort((a, b) => b.passRate - a.passRate || b.total - a.total)
      .slice(0, limit)
    return { term: term.label, items: ranked }
  },

  async fees_outstanding(schoolId, input) {
    const className = typeof input.className === "string" ? input.className : undefined
    const termLabel = typeof input.termLabel === "string" ? input.termLabel : undefined
    const term = await resolveTerm(schoolId, termLabel)

    const invoices = await prisma.feeInvoice.findMany({
      where: {
        schoolId,
        deletedAt: null,
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
        ...(term ? { termId: term.id } : {}),
        ...(className
          ? {
              student: {
                enrollments: {
                  some: {
                    isActive: true,
                    deletedAt: null,
                    section: { class: { name: { contains: className, mode: "insensitive" } } },
                  },
                },
              },
            }
          : {}),
      },
      select: { amountDue: true, amountPaid: true },
    })
    const total = invoices.reduce(
      (acc, inv) => acc + Math.max(0, Number(inv.amountDue) - Number(inv.amountPaid)),
      0,
    )
    return {
      term: term?.label ?? null,
      className: className ?? null,
      invoices: invoices.length,
      outstandingNgn: total,
    }
  },

  async class_average_for_subject(schoolId, input) {
    const subject = String(input.subject ?? "")
    const className = String(input.className ?? "")
    const termLabel = typeof input.termLabel === "string" ? input.termLabel : undefined
    const term = await resolveTerm(schoolId, termLabel)
    if (!term) return { items: [], note: "No active term found." }
    const grades = await prisma.grade.findMany({
      where: {
        schoolId,
        termId: term.id,
        deletedAt: null,
        subject: {
          OR: [
            { name: { contains: subject, mode: "insensitive" } },
            { code: { contains: subject, mode: "insensitive" } },
          ],
        },
        student: {
          enrollments: {
            some: {
              isActive: true,
              deletedAt: null,
              section: { class: { name: { contains: className, mode: "insensitive" } } },
            },
          },
        },
      },
      select: { totalScore: true },
    })
    if (grades.length === 0) return { term: term.label, count: 0, average: null }
    const avg = grades.reduce((acc, g) => acc + g.totalScore, 0) / grades.length
    return {
      term: term.label,
      subject,
      className,
      count: grades.length,
      average: Math.round(avg * 10) / 10,
    }
  },

  async list_overdue_invoices(schoolId, input) {
    const min = Math.max(0, Number(input.minDaysOverdue ?? 1))
    const limit = Math.min(100, Math.max(1, Number(input.limit ?? 20)))
    const cutoff = new Date(Date.now() - min * 24 * 60 * 60 * 1000)
    const invoices = await prisma.feeInvoice.findMany({
      where: {
        schoolId,
        deletedAt: null,
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
        dueDate: { lt: cutoff },
      },
      orderBy: { dueDate: "asc" },
      take: limit,
      include: {
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    })
    return {
      count: invoices.length,
      items: invoices.map((i) => ({
        student: `${i.student.user.firstName} ${i.student.user.lastName}`,
        admissionNumber: i.student.admissionNumber,
        invoiceNo: i.invoiceNo,
        balance: Math.max(0, Number(i.amountDue) - Number(i.amountPaid)),
        dueDate: i.dueDate.toISOString().slice(0, 10),
        daysOverdue: Math.max(
          0,
          Math.floor((Date.now() - i.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
        ),
      })),
    }
  },

  async list_at_risk_students(schoolId, input) {
    const level = typeof input.level === "string" ? input.level : undefined
    const limit = Math.min(100, Math.max(1, Number(input.limit ?? 25)))
    const all = await prisma.aIRiskScore.findMany({
      where: { schoolId, deletedAt: null, ...(level ? { level: level as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } : {}) },
      orderBy: [{ studentId: "asc" }, { computedAt: "desc" }],
      include: {
        student: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    })
    const seen = new Set<string>()
    const items = []
    for (const r of all) {
      if (seen.has(r.studentId)) continue
      seen.add(r.studentId)
      items.push({
        student: `${r.student.user.firstName} ${r.student.user.lastName}`,
        admissionNumber: r.student.admissionNumber,
        riskScore: Math.round(Number(r.score) * 100),
        level: r.level,
        recommendation: r.rationale,
      })
      if (items.length >= limit) break
    }
    items.sort((a, b) => b.riskScore - a.riskScore)
    return { count: items.length, items }
  },
}

/**
 * Run a Claude-issued tool call. Returns the JSON result that we send back as
 * a `tool_result` content block. Unknown tools return an error envelope so the
 * conversation can recover gracefully.
 */
export async function runAskTool(
  schoolId: string,
  name: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  const handler = handlers[name]
  if (!handler) return { error: `Unknown tool: ${name}` }
  try {
    return await handler(schoolId, (input ?? {}) as Record<string, unknown>)
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Tool execution failed",
    }
  }
}

export const ASK_SYSTEM_PROMPT = `You are EduCore AI, an assistant for Nigerian K-12 school administrators.

Answer questions about THIS school by calling the provided tools. Each tool is a curated, read-only database query. You CANNOT mutate data — there are no write tools.

Workflow:
1. Pick the most relevant tool for the question.
2. Call it with the right arguments. If a piece of information is missing (e.g. class name when the user said "JSS"), use a reasonable default and explain your interpretation.
3. When the tool result comes back, write a clear, concise natural-language answer for a school principal. Reference the actual numbers from the result. Format multi-row data as a short bullet list (max 5 items) and summarise the rest.
4. If no tool fits, say so plainly — don't invent answers. Suggest a rephrasing.

Currency is NGN. Today's date should be assumed current. Be specific about which term / class the answer covers.`
