import { NextResponse } from "next/server"
import type { SchoolPlan, SubscriptionStatus } from "@prisma/client"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { listSchools, schoolStates, schoolStatusCounts } from "@/lib/schools"
import { requireApiRole, requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const PLANS = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE", "GOVERNMENT"]
const STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CHURNED"]

export async function GET(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const params = new URL(request.url).searchParams
  const plan = params.get("plan")
  const status = params.get("status")
  const from = params.get("from")
  const to = params.get("to")

  const [result, counts, states] = await Promise.all([
    listSchools({
      page: Number(params.get("page") ?? 1) || 1,
      limit: Number(params.get("limit") ?? 25) || 25,
      search: params.get("search")?.trim() || undefined,
      state: params.get("state")?.trim() || undefined,
      plan: plan && PLANS.includes(plan) ? (plan as SchoolPlan) : undefined,
      status: status && STATUSES.includes(status) ? (status as SubscriptionStatus) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      sort: (params.get("sort") as "name" | "students" | "mrr" | "health" | "created") ?? "name",
    }),
    schoolStatusCounts(),
    schoolStates(),
  ])

  return NextResponse.json({ ...result, counts, states })
}

/** Register a school. Creates the tenant and its subscription together. */
export async function POST(request: Request) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const forbidden = requireApiRole(guard.user, "SALES_ADMIN", "BUSINESS_ADMIN")
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  const state = typeof body.state === "string" ? body.state.trim() : ""
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const plan = typeof body.plan === "string" && PLANS.includes(body.plan) ? body.plan : "STARTER"
  const amount = Number(body.amount ?? 0)
  const cycle = typeof body.cycle === "string" ? body.cycle : "TERMLY"
  const trialDays = Number(body.trialDays ?? 30)

  if (!name) return NextResponse.json({ error: "A school name is required." }, { status: 400 })
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 })
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)

  if (await prisma.school.findUnique({ where: { slug }, select: { id: true } })) {
    return NextResponse.json({ error: `The slug "${slug}" is already taken.` }, { status: 409 })
  }

  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)

  const school = await prisma.school.create({
    data: {
      name,
      slug,
      state: state || null,
      email: email || null,
      subscription: {
        create: {
          plan: plan as SchoolPlan,
          status: "TRIAL",
          cycle: cycle as "MONTHLY" | "TERMLY" | "ANNUAL",
          amount,
          trialEndsAt,
        },
      },
    },
    select: { id: true, name: true, slug: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "school.register",
    target: auditTarget("school", school.id),
    targetType: "school",
    ipAddress: guard.ipAddress,
    details: { name, slug, plan, amount, cycle, trialDays },
  })

  return NextResponse.json({ school }, { status: 201 })
}
