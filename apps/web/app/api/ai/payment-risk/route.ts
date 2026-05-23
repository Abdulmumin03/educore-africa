import { NextResponse } from "next/server"
import { anthropic } from "@/lib/ai"
import { prisma } from "@/lib/db"
import { resolveFinanceAccess } from "@/lib/finance-access"
import { paymentRiskSchema } from "@/lib/finance-schemas"

export const runtime = "nodejs"

const RISK_MODEL = "claude-sonnet-4-6"

const SYSTEM_PROMPT = `You analyse Nigerian K-12 school fee payment data and identify families likely to default on this term's fees.

Input: a JSON list of invoice rows with payment history per family.

Return STRICT JSON only — no markdown, no commentary. Shape:
{"items":[{"invoiceId":"...","riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","recommendation":"one short sentence"}]}

Rules:
- Only include invoices whose probability of default is meaningful (skip LOW).
- CRITICAL: balance > 70% of total AND past due > 30 days AND <30% paid historically.
- HIGH: balance > 50% AND past due > 14 days, OR a clear declining pattern.
- MEDIUM: balance > 25% past due, OR first-time slow payer.
- recommendation: a specific next step ("Schedule home visit", "Offer payment plan", "Escalate to principal"). Avoid generic advice.
- Don't invent invoiceIds — use them verbatim from the input.`

type ResultItem = { invoiceId: string; riskLevel: string; recommendation: string }

function heuristicRisk(balance: number, total: number, paid: number, daysOverdue: number):
  | { riskLevel: "MEDIUM" | "HIGH" | "CRITICAL"; recommendation: string }
  | null {
  const balanceRatio = total > 0 ? balance / total : 0
  const paidRatio = total > 0 ? paid / total : 0
  if (balanceRatio > 0.7 && daysOverdue > 30 && paidRatio < 0.3) {
    return {
      riskLevel: "CRITICAL",
      recommendation: "Schedule a home visit and discuss a structured payment plan immediately.",
    }
  }
  if (balanceRatio > 0.5 && daysOverdue > 14) {
    return {
      riskLevel: "HIGH",
      recommendation: "Call the primary guardian today and confirm a payment date this week.",
    }
  }
  if (balanceRatio > 0.25 && daysOverdue > 7) {
    return {
      riskLevel: "MEDIUM",
      recommendation: "Send a personal SMS reminder and a polite call from the bursar.",
    }
  }
  return null
}

export async function POST(req: Request) {
  const access = await resolveFinanceAccess()
  if (!access.ok) return access.response

  const parsed = paymentRiskSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 })
  const { termId, classId } = parsed.data

  const invoices = await prisma.feeInvoice.findMany({
    where: {
      schoolId: access.session.schoolId,
      termId,
      deletedAt: null,
      status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      ...(classId
        ? { student: { enrollments: { some: { isActive: true, deletedAt: null, section: { classId } } } } }
        : {}),
    },
    take: 60,
    include: {
      student: {
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })
  if (invoices.length === 0) {
    return NextResponse.json({ items: [], model: "n/a", note: "No outstanding invoices" })
  }

  // Past payment patterns: count of prior invoices, prior paid-on-time count.
  const studentIds = invoices.map((i) => i.studentId)
  const priorInvoices = await prisma.feeInvoice.findMany({
    where: {
      schoolId: access.session.schoolId,
      studentId: { in: studentIds },
      termId: { not: termId },
      deletedAt: null,
    },
    select: { studentId: true, dueDate: true, status: true, amountDue: true, amountPaid: true, updatedAt: true },
  })
  const priorByStudent = new Map<
    string,
    { totalPrior: number; paidPrior: number; lateCount: number }
  >()
  for (const p of priorInvoices) {
    const cur = priorByStudent.get(p.studentId) ?? { totalPrior: 0, paidPrior: 0, lateCount: 0 }
    cur.totalPrior += 1
    if (p.status === "PAID") cur.paidPrior += 1
    if (p.status === "PAID" && p.updatedAt.getTime() > p.dueDate.getTime()) cur.lateCount += 1
    priorByStudent.set(p.studentId, cur)
  }

  const now = Date.now()
  const dataset = invoices.map((inv) => {
    const balance = Math.max(0, Number(inv.amountDue) - Number(inv.amountPaid))
    const prior = priorByStudent.get(inv.studentId) ?? { totalPrior: 0, paidPrior: 0, lateCount: 0 }
    return {
      invoiceId: inv.id,
      name: `${inv.student.user.firstName} ${inv.student.user.lastName}`,
      admissionNumber: inv.student.admissionNumber,
      total: Number(inv.amountDue),
      paid: Number(inv.amountPaid),
      balance,
      daysOverdue: Math.max(0, Math.floor((now - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24))),
      priorInvoices: prior.totalPrior,
      priorPaidInFull: prior.paidPrior,
      priorPaidLate: prior.lateCount,
    }
  })

  // Heuristic fallback when no API key.
  if (!process.env.ANTHROPIC_API_KEY) {
    const items = dataset
      .map((d) => {
        const h = heuristicRisk(d.balance, d.total, d.paid, d.daysOverdue)
        return h
          ? {
              invoiceId: d.invoiceId,
              name: d.name,
              admissionNumber: d.admissionNumber,
              balance: d.balance,
              daysOverdue: d.daysOverdue,
              riskLevel: h.riskLevel,
              recommendation: h.recommendation,
            }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    return NextResponse.json({ items, model: "heuristic-fallback" })
  }

  try {
    const res = await anthropic.messages.create({
      model: RISK_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(dataset) }],
    })
    const text = res.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
    let parsedJson: { items: ResultItem[] } = { items: [] }
    try {
      const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
      parsedJson = JSON.parse(cleaned)
    } catch {
      console.error("[ai/payment-risk] parse failed:", text)
      return NextResponse.json({ error: "AI returned unparseable response" }, { status: 502 })
    }
    const byId = new Map(dataset.map((d) => [d.invoiceId, d]))
    const items = (parsedJson.items ?? [])
      .map((r) => {
        const d = byId.get(r.invoiceId)
        if (!d) return null
        return {
          invoiceId: d.invoiceId,
          name: d.name,
          admissionNumber: d.admissionNumber,
          balance: d.balance,
          daysOverdue: d.daysOverdue,
          riskLevel: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(r.riskLevel)
            ? r.riskLevel
            : "MEDIUM",
          recommendation: r.recommendation,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    return NextResponse.json({ items, model: RISK_MODEL })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI failure"
    console.error("[ai/payment-risk]", err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
