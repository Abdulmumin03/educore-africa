import { NextResponse } from "next/server"

import { RISK_MODEL, complete, isAIConfigured } from "@/lib/ai"
import { prisma } from "@/lib/db"
import { monthlyAmount } from "@/lib/metrics"
import { redis } from "@/lib/redis"
import { churnAnalysis, resolveRange, revenueKpis } from "@/lib/revenue"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const CACHE_KEY = "platform:ai-forecast"
const CACHE_TTL_SECONDS = 24 * 60 * 60

export type Scenario = { base: number; optimistic: number; pessimistic: number }
export type Forecast = {
  month1: Scenario
  month2: Scenario
  month3: Scenario
  assumptions: string[]
  risks: string[]
}

const SYSTEM = `You are a SaaS financial analyst for EduCore Africa, a Nigerian \
EdTech company selling school-management software. Amounts are Nigerian naira. \
Reply with JSON only — no prose, no code fences. Never invent inputs: work \
only from the figures given.`

function buildPrompt(inputs: {
  mrr: number
  growthPercent: number
  churnPercent: number
  trials: number
  conversionPercent: number
}): string {
  return `EduCore Africa's current metrics:
- MRR = ${Math.round(inputs.mrr)}
- average monthly growth over the last 6 months = ${inputs.growthPercent.toFixed(2)}%
- monthly churn = ${inputs.churnPercent.toFixed(2)}%
- open trials = ${inputs.trials}, estimated conversion = ${inputs.conversionPercent.toFixed(1)}%

Generate a 3-month MRR forecast with optimistic, base and pessimistic scenarios.
Return exactly this JSON shape, with plain numbers (naira, no separators or currency symbols):
{"month1":{"base":0,"optimistic":0,"pessimistic":0},
 "month2":{"base":0,"optimistic":0,"pessimistic":0},
 "month3":{"base":0,"optimistic":0,"pessimistic":0},
 "assumptions":["..."],
 "risks":["..."]}`
}

/** Pull the first JSON object out of a model reply, fences and all. */
function parseForecast(text: string): Forecast | null {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end <= start) return null

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<Forecast>
    const months = [parsed.month1, parsed.month2, parsed.month3]
    if (months.some((m) => !m || typeof m.base !== "number")) return null

    const clean = (scenario: Scenario): Scenario => ({
      base: Math.max(0, Number(scenario.base) || 0),
      optimistic: Math.max(0, Number(scenario.optimistic) || 0),
      pessimistic: Math.max(0, Number(scenario.pessimistic) || 0),
    })

    return {
      month1: clean(parsed.month1 as Scenario),
      month2: clean(parsed.month2 as Scenario),
      month3: clean(parsed.month3 as Scenario),
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map(String).slice(0, 6) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.map(String).slice(0, 6) : [],
    }
  } catch {
    return null
  }
}

/** Straight compounding from the same inputs — used with no API key or a bad parse. */
function arithmeticForecast(inputs: {
  mrr: number
  growthPercent: number
  churnPercent: number
  trials: number
  conversionPercent: number
  avgPerSchool: number
}): Forecast {
  const net = (inputs.growthPercent - inputs.churnPercent) / 100
  const trialUplift = (inputs.trials * (inputs.conversionPercent / 100) * inputs.avgPerSchool) / 3

  const project = (month: number, rate: number, uplift: number) =>
    Math.round(inputs.mrr * Math.pow(1 + rate, month) + uplift * month)

  return {
    month1: {
      base: project(1, net, trialUplift),
      optimistic: project(1, net + 0.02, trialUplift * 1.4),
      pessimistic: project(1, net - 0.02, trialUplift * 0.5),
    },
    month2: {
      base: project(2, net, trialUplift),
      optimistic: project(2, net + 0.02, trialUplift * 1.4),
      pessimistic: project(2, net - 0.02, trialUplift * 0.5),
    },
    month3: {
      base: project(3, net, trialUplift),
      optimistic: project(3, net + 0.02, trialUplift * 1.4),
      pessimistic: project(3, net - 0.02, trialUplift * 0.5),
    },
    assumptions: [
      `Net monthly movement of ${(net * 100).toFixed(2)}% (growth ${inputs.growthPercent.toFixed(2)}% less churn ${inputs.churnPercent.toFixed(2)}%).`,
      `${inputs.trials} open trials converting at ${inputs.conversionPercent.toFixed(0)}%, spread evenly over the three months.`,
      `Average revenue per school held flat at ${Math.round(inputs.avgPerSchool)}.`,
      "Optimistic and pessimistic bands are the base rate plus or minus two percentage points.",
    ],
    risks: [
      "Trial conversion is an estimate, not an observed rate — it moves the forecast most.",
      "Government contracts renew annually, so one lapse shifts a whole month.",
      "No seasonality is modelled; Nigerian school terms make fee months lumpy.",
    ],
  }
}

export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const refresh = new URL(request.url).searchParams.get("refresh") === "1"
  if (!refresh) {
    try {
      const hit = await redis.get(CACHE_KEY)
      if (hit) return NextResponse.json({ ...JSON.parse(hit), cached: true })
    } catch {
      // Regenerate on a cache miss.
    }
  }

  const range = resolveRange("12m")
  const [kpis, churn, trials, converted] = await Promise.all([
    revenueKpis(range),
    churnAnalysis(range),
    prisma.schoolSubscription.count({ where: { status: "TRIAL" } }),
    // Observed conversion: subscriptions that started on trial and are now paying.
    prisma.schoolSubscription.count({ where: { status: { in: ["ACTIVE", "PAST_DUE"] } } }),
  ])

  const points = await prisma.schoolSubscription.findMany({
    where: { status: { in: ["ACTIVE", "PAST_DUE"] } },
    select: { amount: true, cycle: true, startedAt: true },
  })

  // Average monthly growth over the last six months, from when subscriptions started.
  const now = new Date()
  const monthlyMrr: number[] = []
  for (let back = 6; back >= 0; back--) {
    const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, 0))
    monthlyMrr.push(
      points
        .filter((p) => p.startedAt <= at)
        .reduce((sum, p) => sum + monthlyAmount(Number(p.amount), p.cycle), 0),
    )
  }
  const growthRates: number[] = []
  for (let i = 1; i < monthlyMrr.length; i++) {
    if (monthlyMrr[i - 1] > 0) growthRates.push((monthlyMrr[i] - monthlyMrr[i - 1]) / monthlyMrr[i - 1])
  }
  const growthPercent =
    growthRates.length > 0 ? (growthRates.reduce((a, b) => a + b, 0) / growthRates.length) * 100 : 0

  const recentChurn = churn.months.slice(-6)
  const churnPercent =
    recentChurn.length > 0
      ? recentChurn.reduce((sum, m) => sum + m.rate, 0) / recentChurn.length
      : 0

  const conversionPercent = trials + converted > 0 ? (converted / (trials + converted)) * 100 : 35

  const inputs = {
    mrr: kpis.mrr,
    growthPercent,
    churnPercent,
    trials,
    conversionPercent,
    avgPerSchool: kpis.avgPerSchool,
  }

  let forecast: Forecast | null = null
  let source: "model" | "arithmetic" = "arithmetic"

  if (isAIConfigured()) {
    try {
      const text = await complete({
        system: SYSTEM,
        prompt: buildPrompt(inputs),
        model: RISK_MODEL,
        maxTokens: 2000,
        effort: "medium",
      })
      if (text) {
        forecast = parseForecast(text)
        if (forecast) source = "model"
      }
    } catch (error) {
      console.error("[ai] revenue forecast failed", error)
    }
  }

  if (!forecast) forecast = arithmeticForecast(inputs)

  const body = {
    forecast,
    source,
    model: source === "model" ? RISK_MODEL : null,
    inputs: {
      mrr: Math.round(inputs.mrr),
      growthPercent: Number(growthPercent.toFixed(2)),
      churnPercent: Number(churnPercent.toFixed(2)),
      trials,
      conversionPercent: Number(conversionPercent.toFixed(1)),
    },
    generatedAt: new Date().toISOString(),
    cached: false,
  }

  try {
    await redis.set(CACHE_KEY, JSON.stringify(body), "EX", CACHE_TTL_SECONDS)
  } catch {
    // Non-fatal.
  }

  return NextResponse.json(body)
}
