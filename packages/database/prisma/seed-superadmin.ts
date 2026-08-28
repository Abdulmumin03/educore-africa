/**
 * Seed data for the Super Admin Console.
 *
 *   pnpm --filter @educore/database seed:superadmin
 *   pnpm prisma db seed            (runs the school seed, then this)
 *
 * Two rules govern everything below.
 *
 * 1. Every school it creates is slugged `demo-*` and named "… (Demo)". The
 *    console's own erasure and rollback tooling keys off that prefix, and a
 *    seed that produced indistinguishable rows would make a staging database
 *    impossible to clean up safely.
 *
 * 2. It is idempotent and additive. Re-running tops the data back up to the
 *    target counts rather than duplicating it, and it never deletes a row it
 *    did not create — running this against a database with real tenants in it
 *    should be dull, not destructive.
 *
 * The generated figures are deterministic: a fixed-seed PRNG, not
 * Math.random. Two people seeding the same database get the same dashboard,
 * which makes "is this number right?" answerable.
 */

import {
  BillingCycle,
  PaymentChannel,
  PrismaClient,
  SchoolPlan,
  SubscriptionStatus,
  SuperAdminRole,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TransactionStatus,
} from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

// ═══════════════════════════════════════════════════════════════════
// Deterministic randomness
// ═══════════════════════════════════════════════════════════════════

// mulberry32 — small, fast, and the same sequence on every machine.
function makeRandom(seed: number) {
  let state = seed >>> 0
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = makeRandom(20260828)

const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
const chance = (probability: number) => random() < probability

function daysAgo(days: number): Date {
  const date = new Date()
  date.setUTCHours(9, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - days)
  return date
}

// ═══════════════════════════════════════════════════════════════════
// Reference data
// ═══════════════════════════════════════════════════════════════════

const CONSOLE_PASSWORD = process.env.SEED_SUPERADMIN_PASSWORD ?? "EduCore#Console2026"

const CONSOLE_USERS: Array<{ email: string; name: string; role: SuperAdminRole }> = [
  { email: "admin@educoreafrica.com", name: "Amara Okonkwo", role: SuperAdminRole.SUPER_ADMIN },
  { email: "business@educoreafrica.com", name: "Tunde Adeyemi", role: SuperAdminRole.BUSINESS_ADMIN },
  { email: "finance@educoreafrica.com", name: "Ngozi Eze", role: SuperAdminRole.FINANCE_ADMIN },
  { email: "sales@educoreafrica.com", name: "Bashir Lawal", role: SuperAdminRole.SALES_ADMIN },
  { email: "support@educoreafrica.com", name: "Chiamaka Nwosu", role: SuperAdminRole.SUPPORT_ADMIN },
  { email: "analytics@educoreafrica.com", name: "Femi Bankole", role: SuperAdminRole.ANALYTICS_ADMIN },
  { email: "engineering@educoreafrica.com", name: "Hauwa Ibrahim", role: SuperAdminRole.ENGINEERING_ADMIN },
]

/** Ten states, with the cities the schools actually sit in. */
const STATES: Array<{ state: string; cities: string[] }> = [
  { state: "Lagos", cities: ["Ikeja", "Lekki", "Yaba", "Surulere", "Ikorodu"] },
  { state: "FCT", cities: ["Garki", "Wuse", "Gwarinpa", "Kubwa"] },
  { state: "Rivers", cities: ["Port Harcourt", "Bonny", "Oyigbo"] },
  { state: "Kano", cities: ["Kano", "Wudil", "Gwale"] },
  { state: "Oyo", cities: ["Ibadan", "Ogbomosho", "Oyo"] },
  { state: "Kaduna", cities: ["Kaduna", "Zaria", "Kafanchan"] },
  { state: "Enugu", cities: ["Enugu", "Nsukka", "Awgu"] },
  { state: "Anambra", cities: ["Awka", "Onitsha", "Nnewi"] },
  { state: "Ogun", cities: ["Abeokuta", "Sagamu", "Ijebu-Ode"] },
  { state: "Delta", cities: ["Asaba", "Warri", "Ughelli"] },
]

const SCHOOL_PREFIX = [
  "Bright Future",
  "Cornerstone",
  "Divine Grace",
  "Excellence",
  "Golden Gate",
  "Hilltop",
  "Kings & Queens",
  "Legacy",
  "Mount Zion",
  "New Horizon",
  "Pacesetter",
  "Royal Heritage",
  "Springfield",
  "Trinity",
  "Unity",
  "Victory",
  "Wisdom Gate",
  "Crescent",
  "Emerald",
  "Pinnacle",
  "Sunrise",
  "Harmony",
  "Greenfield",
  "Nobel",
  "Almanac",
]

const SCHOOL_SUFFIX = [
  "International School",
  "Academy",
  "College",
  "Model School",
  "Comprehensive College",
  "Group of Schools",
  "Schools",
]

/** Per-cycle price by plan, in naira. Matches the seeded plan_configs. */
const PLAN_PRICE: Record<SchoolPlan, number> = {
  STARTER: 45_000,
  GROWTH: 120_000,
  PROFESSIONAL: 280_000,
  ENTERPRISE: 650_000,
  GOVERNMENT: 400_000,
}

const PLAN_WEIGHTS: Array<{ plan: SchoolPlan; weight: number }> = [
  { plan: SchoolPlan.STARTER, weight: 34 },
  { plan: SchoolPlan.GROWTH, weight: 30 },
  { plan: SchoolPlan.PROFESSIONAL, weight: 20 },
  { plan: SchoolPlan.ENTERPRISE, weight: 10 },
  { plan: SchoolPlan.GOVERNMENT, weight: 6 },
]

const STATUS_WEIGHTS: Array<{ status: SubscriptionStatus; weight: number }> = [
  { status: SubscriptionStatus.ACTIVE, weight: 62 },
  { status: SubscriptionStatus.TRIAL, weight: 14 },
  { status: SubscriptionStatus.PAST_DUE, weight: 12 },
  { status: SubscriptionStatus.SUSPENDED, weight: 6 },
  { status: SubscriptionStatus.CHURNED, weight: 6 },
]

function weighted<T>(options: Array<{ weight: number } & Record<string, unknown>>, key: string): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0)
  let roll = random() * total
  for (const option of options) {
    roll -= option.weight
    if (roll <= 0) return option[key] as T
  }
  return options[options.length - 1]![key] as T
}

const TICKET_SEEDS: Array<{
  title: string
  description: string
  category: TicketCategory
  priority: TicketPriority
}> = [
  {
    title: "Paystack payment shows successful but invoice still unpaid",
    description:
      "Three parents paid school fees through the parent portal yesterday. They have the Paystack receipt but the invoice still shows outstanding on our side. References attached in the thread.",
    category: TicketCategory.BILLING,
    priority: TicketPriority.HIGH,
  },
  {
    title: "Cannot generate JSS3 report cards — page hangs",
    description:
      "Selecting JSS3 and clicking generate spins forever. Other classes work. This is blocking us; report cards go home on Friday.",
    category: TicketCategory.TECHNICAL,
    priority: TicketPriority.CRITICAL,
  },
  {
    title: "Bursar account locked out after password change",
    description:
      "Our bursar changed her password this morning and now gets 'account locked'. She has not tried more than twice.",
    category: TicketCategory.ACCOUNT,
    priority: TicketPriority.HIGH,
  },
  {
    title: "Please add WAEC subject codes to the subject setup screen",
    description:
      "We enter WAEC codes by hand every term. Could the subject screen carry them so they come across automatically?",
    category: TicketCategory.FEATURE_REQUEST,
    priority: TicketPriority.LOW,
  },
  {
    title: "Attendance SMS not reaching parents on Glo",
    description:
      "MTN and Airtel numbers receive the attendance alerts. Glo numbers get nothing. Started about a week ago.",
    category: TicketCategory.TECHNICAL,
    priority: TicketPriority.HIGH,
  },
  {
    title: "Invoice for the term shows the old student count",
    description:
      "We moved from 320 to 388 students in January but the subscription invoice still bills for the smaller number. Happy to pay the difference, just need a correct invoice.",
    category: TicketCategory.BILLING,
    priority: TicketPriority.MEDIUM,
  },
  {
    title: "Bulk student import fails on row 214",
    description:
      "The CSV import stops at row 214 with 'invalid date of birth'. The date looks the same as every other row to us.",
    category: TicketCategory.TECHNICAL,
    priority: TicketPriority.MEDIUM,
  },
  {
    title: "Request: second admin account for the new vice principal",
    description: "Our new VP starts on Monday and needs admin access to grades and attendance only.",
    category: TicketCategory.ACCOUNT,
    priority: TicketPriority.LOW,
  },
  {
    title: "Timetable clash warning appears for a free period",
    description:
      "Period 5 on Wednesday is free for SS2A but the timetable builder flags a clash with the same teacher in SS1B.",
    category: TicketCategory.TECHNICAL,
    priority: TicketPriority.MEDIUM,
  },
  {
    title: "Can we pay termly instead of monthly?",
    description:
      "Our fees come in termly and monthly billing does not match our cash flow. What is involved in switching?",
    category: TicketCategory.BILLING,
    priority: TicketPriority.LOW,
  },
  {
    title: "Hostel exeat OTP never arrives",
    description:
      "Boarding house staff cannot approve exeats — the OTP SMS does not come through to the parent's phone.",
    category: TicketCategory.TECHNICAL,
    priority: TicketPriority.HIGH,
  },
  {
    title: "Library fine rate is wrong for the new session",
    description:
      "We agreed ₦50 per day but the system is charging ₦100. Where do we change this ourselves?",
    category: TicketCategory.ACCOUNT,
    priority: TicketPriority.LOW,
  },
  {
    title: "Bus tracking map is blank on the school's tablets",
    description:
      "The map loads on laptops but shows an empty grey box on our Android tablets in the transport office.",
    category: TicketCategory.TECHNICAL,
    priority: TicketPriority.MEDIUM,
  },
  {
    title: "Duplicate admission numbers after re-import",
    description:
      "Two students in JSS1 now share an admission number after we re-ran an import. Which one is authoritative?",
    category: TicketCategory.TECHNICAL,
    priority: TicketPriority.HIGH,
  },
  {
    title: "Refund for double-charged subscription",
    description:
      "We were charged twice on 3 August for the same term. Please refund one and confirm by email.",
    category: TicketCategory.BILLING,
    priority: TicketPriority.HIGH,
  },
  {
    title: "Feature request: parent-facing fee statement PDF",
    description:
      "Parents keep asking for a single statement showing every payment for the year. Right now we build it by hand.",
    category: TicketCategory.FEATURE_REQUEST,
    priority: TicketPriority.MEDIUM,
  },
  {
    title: "Cambridge Checkpoint grade boundaries not applying",
    description:
      "Our Cambridge stream is being graded on the WAEC scale. The curriculum is set correctly on the class.",
    category: TicketCategory.TECHNICAL,
    priority: TicketPriority.CRITICAL,
  },
  {
    title: "How do we archive last session's students?",
    description:
      "Graduated SS3 students still appear in the active roll and inflate our student count.",
    category: TicketCategory.OTHER,
    priority: TicketPriority.LOW,
  },
  {
    title: "SMS credit balance shows zero after top-up",
    description:
      "We topped up ₦25,000 through Paystack this morning; the balance still reads zero and messages are not sending.",
    category: TicketCategory.BILLING,
    priority: TicketPriority.CRITICAL,
  },
  {
    title: "Staff appraisal summaries are cut off halfway",
    description:
      "The AI appraisal text stops mid-sentence for longer staff records. Shorter ones are fine.",
    category: TicketCategory.TECHNICAL,
    priority: TicketPriority.LOW,
  },
]

// ═══════════════════════════════════════════════════════════════════
// Console users
// ═══════════════════════════════════════════════════════════════════

async function seedConsoleUsers() {
  const passwordHash = await bcrypt.hash(CONSOLE_PASSWORD, 12)
  let created = 0

  for (const user of CONSOLE_USERS) {
    const existing = await prisma.superAdminUser.findUnique({
      where: { email: user.email },
      select: { id: true },
    })
    if (existing) continue

    await prisma.superAdminUser.create({
      data: {
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
        // TOTP is deliberately NOT pre-enrolled. The console walks every new
        // account through enrolment on first sign-in, and a seed that skipped
        // that would leave a password-only door into the platform console.
        totpEnabled: false,
        isActive: true,
      },
    })
    created += 1
  }

  return { created, total: CONSOLE_USERS.length }
}

// ═══════════════════════════════════════════════════════════════════
// Schools
// ═══════════════════════════════════════════════════════════════════

const TARGET_SCHOOLS = 50

async function seedSchools() {
  const existing = await prisma.school.count({ where: { slug: { startsWith: "demo-" } } })
  if (existing >= TARGET_SCHOOLS) return { created: 0, existing }

  const usedSlugs = new Set(
    (
      await prisma.school.findMany({ where: { slug: { startsWith: "demo-" } }, select: { slug: true } })
    ).map((row) => row.slug),
  )

  let created = 0

  for (let index = existing; index < TARGET_SCHOOLS; index++) {
    const region = STATES[index % STATES.length]!
    const name = `${pick(SCHOOL_PREFIX)} ${pick(SCHOOL_SUFFIX)}`
    const base = `demo-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`

    let slug = base
    let attempt = 2
    while (usedSlugs.has(slug)) slug = `${base}-${attempt++}`
    usedSlugs.add(slug)

    // Older schools are more likely to be established and paying; the newest
    // are the trials. Spread over two years so the growth chart has a shape.
    const ageDays = between(5, 730)
    const createdAt = daysAgo(ageDays)

    const plan = weighted<SchoolPlan>(PLAN_WEIGHTS, "plan")
    const status =
      ageDays < 25
        ? SubscriptionStatus.TRIAL
        : weighted<SubscriptionStatus>(STATUS_WEIGHTS, "status")
    const cycle = chance(0.55)
      ? BillingCycle.TERMLY
      : chance(0.6)
        ? BillingCycle.MONTHLY
        : BillingCycle.ANNUAL

    // The list price is per MONTH; termly and annual buy a discount, which is
    // why the console derives MRR rather than reading `amount` directly.
    const monthly = PLAN_PRICE[plan]
    const amount =
      cycle === BillingCycle.MONTHLY
        ? monthly
        : cycle === BillingCycle.TERMLY
          ? Math.round(monthly * 3 * 0.92)
          : Math.round(monthly * 12 * 0.83)

    const school = await prisma.school.create({
      data: {
        name: `${name} (Demo)`,
        slug,
        motto: pick(["Knowledge is Power", "Discipline and Excellence", "Rise and Shine", "Learning for Life"]),
        state: region.state,
        city: pick(region.cities),
        country: "Nigeria",
        email: `admin@${slug.replace(/^demo-/, "")}.edu.ng`,
        phone: `+23480${between(10000000, 99999999)}`,
        createdAt,
        isActive: status !== SubscriptionStatus.CHURNED && status !== SubscriptionStatus.SUSPENDED,
        subscription: {
          create: {
            plan,
            status,
            cycle,
            amount,
            currency: "NGN",
            seats: plan === SchoolPlan.ENTERPRISE ? null : between(200, 1500),
            startedAt: createdAt,
            trialEndsAt:
              status === SubscriptionStatus.TRIAL
                ? daysAgo(ageDays - 30) // 30 days from signup, which may be past
                : null,
            renewsAt:
              status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.PAST_DUE
                ? daysAgo(-between(3, 85))
                : null,
            cancelledAt: status === SubscriptionStatus.CHURNED ? daysAgo(between(5, 120)) : null,
            churnReason:
              status === SubscriptionStatus.CHURNED
                ? pick([
                    "Moved to a competitor",
                    "Could not afford renewal",
                    "School closed",
                    "Went back to paper records",
                  ])
                : null,
            paymentMethod:
              status === SubscriptionStatus.TRIAL
                ? null
                : pick(["Paystack · Visa •••• 4821", "Paystack · Verve •••• 1102", "Bank transfer", "Flutterwave · Mastercard •••• 7730"]),
          },
        },
      },
      select: { id: true, name: true, createdAt: true },
    })

    created += 1
    void school
  }

  return { created, existing }
}

// ═══════════════════════════════════════════════════════════════════
// Six months of daily metric snapshots
// ═══════════════════════════════════════════════════════════════════

const SNAPSHOT_DAYS = 183

async function seedSnapshots() {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const oldest = new Date(today)
  oldest.setUTCDate(oldest.getUTCDate() - SNAPSHOT_DAYS)

  const present = new Set(
    (
      await prisma.platformMetricSnapshot.findMany({
        where: { snapshotDate: { gte: oldest } },
        select: { snapshotDate: true },
      })
    ).map((row) => row.snapshotDate.toISOString().slice(0, 10)),
  )

  // Today's real figures are the end point, and the series is walked
  // BACKWARDS from them — so the history joins up with what the console
  // actually shows rather than contradicting it on the most recent day.
  const [totalSchools, totalStudents, totalStaff, activeSubs] = await Promise.all([
    prisma.school.count({ where: { deletedAt: null } }),
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.staff.count({ where: { deletedAt: null } }),
    prisma.schoolSubscription.findMany({
      where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] } },
      select: { amount: true, cycle: true },
    }),
  ])

  const mrrToday = activeSubs.reduce((sum, sub) => {
    const amount = Number(sub.amount)
    const monthly =
      sub.cycle === BillingCycle.MONTHLY
        ? amount
        : sub.cycle === BillingCycle.TERMLY
          ? amount / 3
          : amount / 12
    return sum + monthly
  }, 0)

  let schools = totalSchools
  let students = totalStudents
  let staff = totalStaff
  let mrr = mrrToday

  const rows: Array<{
    snapshotDate: Date
    totalSchools: number
    activeSchools: number
    totalStudents: number
    totalStaff: number
    mrr: number
    newSignups: number
    churned: number
    trialSchools: number
  }> = []

  for (let offset = 0; offset <= SNAPSHOT_DAYS; offset++) {
    const date = new Date(today)
    date.setUTCDate(date.getUTCDate() - offset)
    const key = date.toISOString().slice(0, 10)

    if (!present.has(key)) {
      rows.push({
        snapshotDate: date,
        totalSchools: Math.max(1, Math.round(schools)),
        activeSchools: Math.max(1, Math.round(schools * (0.72 + random() * 0.16))),
        totalStudents: Math.max(0, Math.round(students)),
        totalStaff: Math.max(0, Math.round(staff)),
        mrr: Math.max(0, Math.round(mrr)),
        newSignups: 0, // filled below, once the month boundaries are known
        churned: 0,
        trialSchools: Math.max(0, Math.round(schools * 0.12)),
      })
    }

    // Walk one day further back: the platform was a little smaller.
    const signupToday = chance(0.28) ? 1 : 0
    const churnToday = chance(0.05) ? 1 : 0
    schools = Math.max(1, schools - signupToday + churnToday)
    students = Math.max(0, students * (1 - 0.0016 * (0.6 + random())))
    staff = Math.max(0, staff * (1 - 0.0012 * (0.6 + random())))
    mrr = Math.max(0, mrr * (1 - 0.0022 * (0.5 + random())))

    const row = rows[rows.length - 1]
    if (row) {
      row.newSignups = signupToday
      row.churned = churnToday
    }
  }

  if (rows.length === 0) return { created: 0 }

  await prisma.platformMetricSnapshot.createMany({ data: rows, skipDuplicates: true })
  return { created: rows.length }
}

// ═══════════════════════════════════════════════════════════════════
// Support tickets
// ═══════════════════════════════════════════════════════════════════

async function seedTickets() {
  const schools = await prisma.school.findMany({
    where: { slug: { startsWith: "demo-" } },
    select: { id: true },
    take: 50,
  })
  if (schools.length === 0) return { created: 0, skipped: "no demo schools" }

  const existing = await prisma.supportTicket.count({
    where: { school: { slug: { startsWith: "demo-" } } },
  })
  if (existing >= TICKET_SEEDS.length) return { created: 0, existing }

  const agents = await prisma.superAdminUser.findMany({
    where: { role: { in: [SuperAdminRole.SUPPORT_ADMIN, SuperAdminRole.ENGINEERING_ADMIN] } },
    select: { id: true },
  })

  let created = 0

  for (let index = existing; index < TICKET_SEEDS.length; index++) {
    const seed = TICKET_SEEDS[index]!
    const school = pick(schools)
    const openedDaysAgo = between(0, 21)
    const createdAt = daysAgo(openedDaysAgo)

    // Status follows age, so the SLA board is not full of month-old OPENs.
    const status =
      openedDaysAgo > 12
        ? pick([TicketStatus.RESOLVED, TicketStatus.CLOSED])
        : openedDaysAgo > 4
          ? pick([TicketStatus.IN_PROGRESS, TicketStatus.WAITING_ON_CLIENT, TicketStatus.RESOLVED])
          : pick([TicketStatus.OPEN, TicketStatus.OPEN, TicketStatus.IN_PROGRESS])

    const answered = status !== TicketStatus.OPEN
    const firstResponseAt = answered
      ? new Date(createdAt.getTime() + between(20, 600) * 60_000)
      : null
    const resolvedAt =
      status === TicketStatus.RESOLVED || status === TicketStatus.CLOSED
        ? new Date(createdAt.getTime() + between(4, 96) * 3_600_000)
        : null

    await prisma.supportTicket.create({
      data: {
        schoolId: school.id,
        title: seed.title,
        description: seed.description,
        category: seed.category,
        priority: seed.priority,
        status,
        assignedTo: answered && agents.length > 0 ? pick(agents).id : null,
        createdAt,
        firstResponseAt,
        resolvedAt,
        escalatedAt:
          seed.priority === TicketPriority.CRITICAL && chance(0.4)
            ? new Date(createdAt.getTime() + 2 * 3_600_000)
            : null,
      },
    })
    created += 1
  }

  return { created, existing }
}

// ═══════════════════════════════════════════════════════════════════
// Subscription transactions
// ═══════════════════════════════════════════════════════════════════

const TARGET_TRANSACTIONS = 30

async function seedTransactions() {
  const subs = await prisma.schoolSubscription.findMany({
    where: { school: { slug: { startsWith: "demo-" } } },
    select: { id: true, schoolId: true, amount: true, cycle: true, plan: true },
  })
  if (subs.length === 0) return { created: 0, skipped: "no demo subscriptions" }

  const existing = await prisma.subscriptionTransaction.count({
    where: { reference: { startsWith: "DEMO-TXN-" } },
  })
  if (existing >= TARGET_TRANSACTIONS) return { created: 0, existing }

  const rows: Array<Record<string, unknown>> = []

  for (let index = existing; index < TARGET_TRANSACTIONS; index++) {
    const sub = pick(subs)
    const daysBack = between(1, 150)
    const createdAt = daysAgo(daysBack)

    // Roughly one in six fails — enough to give the failed-payments screen
    // something real to work with, not so many that the revenue view lies.
    const status = chance(0.17)
      ? chance(0.25)
        ? TransactionStatus.PENDING
        : TransactionStatus.FAILED
      : TransactionStatus.SUCCESSFUL

    const periodStart = createdAt
    const periodEnd = new Date(createdAt)
    periodEnd.setUTCMonth(
      periodEnd.getUTCMonth() + (sub.cycle === BillingCycle.ANNUAL ? 12 : sub.cycle === BillingCycle.TERMLY ? 3 : 1),
    )

    rows.push({
      schoolId: sub.schoolId,
      subscriptionId: sub.id,
      description: `${sub.plan} plan — ${sub.cycle.toLowerCase()} subscription`,
      amount: sub.amount,
      currency: "NGN",
      gateway: chance(0.7) ? PaymentChannel.PAYSTACK : PaymentChannel.FLUTTERWAVE,
      status,
      reference: `DEMO-TXN-${String(index + 1).padStart(4, "0")}`,
      gatewayRef: status === TransactionStatus.SUCCESSFUL ? `ref_${Math.floor(random() * 1e12).toString(36)}` : null,
      failureReason:
        status === TransactionStatus.FAILED
          ? pick([
              "Insufficient funds",
              "Card declined by issuer",
              "Transaction timed out at the bank",
              "Card expired",
            ])
          : null,
      attempts: status === TransactionStatus.FAILED ? between(1, 3) : 1,
      lastAttemptAt: createdAt,
      periodStart,
      periodEnd,
      dueDate: periodStart,
      paidAt: status === TransactionStatus.SUCCESSFUL ? createdAt : null,
      remindersSent: status === TransactionStatus.FAILED ? between(0, 2) : 0,
      createdAt,
    })
  }

  await prisma.subscriptionTransaction.createMany({ data: rows as never, skipDuplicates: true })
  return { created: rows.length, existing }
}

// ═══════════════════════════════════════════════════════════════════

export async function seedSuperAdmin() {
  const users = await seedConsoleUsers()
  const schools = await seedSchools()
  // Snapshots read the school and student counts, so they run afterwards.
  const snapshots = await seedSnapshots()
  const tickets = await seedTickets()
  const transactions = await seedTransactions()

  console.log("Super Admin Console seed")
  console.log(`  console users      ${users.created} created (${users.total} defined)`)
  console.log(`  demo schools       ${schools.created} created (${schools.existing} already present)`)
  console.log(`  metric snapshots   ${snapshots.created} created`)
  console.log(`  support tickets    ${tickets.created} created`)
  console.log(`  transactions       ${transactions.created} created`)

  if (users.created > 0) {
    console.log("")
    console.log(`  Sign in as admin@educoreafrica.com with the password "${CONSOLE_PASSWORD}".`)
    console.log("  TOTP is not pre-enrolled — the console will walk you through it on first sign-in.")
    console.log("  Set SEED_SUPERADMIN_PASSWORD to choose a different one before seeding.")
  }
}

// Run directly (`tsx prisma/seed-superadmin.ts`) as well as being imported by
// the main seed.
const invokedDirectly =
  process.argv[1] !== undefined && /seed-superadmin\.(ts|js)$/.test(process.argv[1])

if (invokedDirectly) {
  seedSuperAdmin()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
      console.error(error)
      await prisma.$disconnect()
      process.exit(1)
    })
}
