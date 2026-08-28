/**
 * Demo data for the Super Admin Console.
 *
 *   pnpm --filter superadmin seed:demo          # create
 *   pnpm --filter superadmin seed:demo -- --undo  # remove everything it made
 *
 * Every row it creates is a school whose slug starts with `demo-`, plus that
 * school's children (cascade-deleted on undo). It NEVER touches rows it did
 * not create, so a real dev database is safe.
 */
import { PrismaClient } from "@prisma/client"
import type {
  BillingCycle,
  PaymentChannel,
  SchoolPlan,
  SubscriptionStatus,
  TransactionStatus,
} from "@prisma/client"

const prisma = new PrismaClient()
const PREFIX = "demo-"

// Deterministic PRNG so re-seeding produces the same shape and the numbers in
// screenshots stay stable between runs.
let seed = 20260826
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const pick = <T,>(items: T[]): T => items[Math.floor(rand() * items.length)]
const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1))

const STATES: Array<[string, number]> = [
  ["Lagos", 14], ["Kano", 7], ["FCT", 6], ["Kaduna", 5], ["Oyo", 5], ["Rivers", 4],
  ["Ogun", 4], ["Anambra", 3], ["Enugu", 3], ["Edo", 3], ["Delta", 2], ["Imo", 2],
  ["Plateau", 2], ["Katsina", 2], ["Sokoto", 1], ["Borno", 1], ["Cross River", 1],
  ["Akwa Ibom", 1], ["Abia", 1], ["Osun", 1], ["Kwara", 1], ["Benue", 1],
]

const NAME_A = ["Greenfield", "Sunrise", "Pacesetters", "Unity", "Bright Future", "Cornerstone",
  "Alhikmah", "Crescent", "Loyola", "Trinity", "Immaculate Heart", "Grange", "Corona",
  "Chrisland", "Baptist", "Command", "Federal Government", "Nurul Islam", "Hillcrest",
  "Riverside", "Faith", "Sardauna", "Air Force", "Deeper Life", "St. Saviour", "Winners",
  "Regent", "Lighthouse", "Emerald", "Vale"]
const NAME_B = ["International School", "Model Academy", "College", "Comprehensive School",
  "High School", "Secondary School", "Academy", "Group of Schools"]

const PLAN_PRICING: Record<SchoolPlan, { termly: number; seats: number | null }> = {
  STARTER: { termly: 75_000, seats: 500 },
  GROWTH: { termly: 180_000, seats: 1_200 },
  PROFESSIONAL: { termly: 420_000, seats: 2_500 },
  ENTERPRISE: { termly: 900_000, seats: null },
  GOVERNMENT: { termly: 600_000, seats: null },
}

// Weighted so the mix looks like a real SaaS book, not a uniform spread.
const PLAN_WEIGHTS: SchoolPlan[] = [
  ...Array<SchoolPlan>(8).fill("STARTER"),
  ...Array<SchoolPlan>(7).fill("GROWTH"),
  ...Array<SchoolPlan>(4).fill("PROFESSIONAL"),
  ...Array<SchoolPlan>(2).fill("ENTERPRISE"),
  "GOVERNMENT",
]

const CHURN_REASONS = [
  "Switched to a competitor",
  "Closed permanently",
  "Budget cut — contract lapsed",
  "Non-payment after 3 reminders",
  "Merged with another school",
]

// The WAEC preset from apps/web's lib/curriculum-presets, inlined: the seed
// must not import from the school app, and the shape is what Curriculum
// .gradingScale expects.
const WAEC_GRADING = {
  scale: [
    { grade: "A1", minScore: 75, maxScore: 100, points: 4.0, remark: "Excellent" },
    { grade: "B2", minScore: 70, maxScore: 74, points: 3.5, remark: "Very good" },
    { grade: "B3", minScore: 65, maxScore: 69, points: 3.0, remark: "Good" },
    { grade: "C4", minScore: 60, maxScore: 64, points: 2.5, remark: "Credit" },
    { grade: "C5", minScore: 55, maxScore: 59, points: 2.0, remark: "Credit" },
    { grade: "C6", minScore: 50, maxScore: 54, points: 1.5, remark: "Credit" },
    { grade: "D7", minScore: 45, maxScore: 49, points: 1.0, remark: "Pass" },
    { grade: "E8", minScore: 40, maxScore: 44, points: 0.5, remark: "Pass" },
    { grade: "F9", minScore: 0, maxScore: 39, points: 0.0, remark: "Fail" },
  ],
  caWeight: 40,
  examWeight: 60,
  caComponents: ["CA1", "CA2", "Mid-Term", "Assignment"],
  positionRanking: true,
}

const DAY = 86_400_000

// Mirrors SLA_TARGETS in lib/support.ts. Duplicated deliberately: the seed
// should keep working even if the policy in the app changes, so a shifted
// target shows up as changed compliance rather than a silently rewritten seed.
const SLA_FIRST_RESPONSE: Record<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number> = {
  CRITICAL: 1,
  HIGH: 4,
  MEDIUM: 8,
  LOW: 24,
}

async function undo() {
  const schools = await prisma.school.findMany({
    where: { slug: { startsWith: PREFIX } },
    select: { id: true },
  })
  if (schools.length === 0) {
    console.log("Nothing to remove — no demo schools found.")
    return
  }

  const ids = schools.map((school) => school.id)

  // Audit rows reference schools by string, not FK, so clear them explicitly.
  await prisma.superAdminAuditLog.deleteMany({
    where: { targetType: "school", target: { in: ids.map((id) => `school:${id}`) } },
  })

  // User.schoolId is onDelete: SetNull, NOT cascade — deleting the school
  // would orphan its users and leave their unique emails taken, which then
  // breaks the next seed. Remove them first; students and staff cascade off
  // the user rows.
  const users = await prisma.user.deleteMany({
    where: { OR: [{ schoolId: { in: ids } }, { email: { contains: "@demo-" } }] },
  })

  // Broadcasts have no school FK, so nothing cascades them away.
  const broadcasts = await prisma.broadcast.deleteMany({
    where: { title: { startsWith: "[demo] " } },
  })

  const removed = await prisma.school.deleteMany({ where: { id: { in: ids } } })
  console.log(
    `Removed ${removed.count} demo schools, ${users.count} demo users and ${broadcasts.count} demo broadcasts, plus everything cascading from them.`,
  )
}

async function create() {
  const existing = await prisma.school.count({ where: { slug: { startsWith: PREFIX } } })
  if (existing > 0) {
    console.log(`${existing} demo schools already exist. Run with --undo first to reseed.`)
    return
  }

  const now = Date.now()
  const admin = await prisma.superAdminUser.findFirst({ select: { id: true } })

  // Every active console account is a candidate ticket assignee.
  const agents = await prisma.superAdminUser.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  })

  let created = 0
  let index = 0

  for (const [state, count] of STATES) {
    for (let n = 0; n < count; n++) {
      index += 1
      const name = `${pick(NAME_A)} ${pick(NAME_B)}`
      const slug = `${PREFIX}${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`

      // Spread registrations across 14 months so the growth chart has shape.
      const ageDays = between(5, 430)
      const createdAt = new Date(now - ageDays * DAY)

      const plan = pick(PLAN_WEIGHTS)
      const pricing = PLAN_PRICING[plan]
      const cycle: BillingCycle = rand() < 0.75 ? "TERMLY" : rand() < 0.6 ? "MONTHLY" : "ANNUAL"
      const amount =
        cycle === "TERMLY"
          ? pricing.termly
          : cycle === "MONTHLY"
            ? Math.round(pricing.termly / 3)
            : pricing.termly * 4

      // Young schools are still on trial; a slice of the rest have lapsed.
      const roll = rand()
      const status: SubscriptionStatus =
        ageDays < 40 && roll < 0.7
          ? "TRIAL"
          : roll < 0.06
            ? "CHURNED"
            : roll < 0.1
              ? "SUSPENDED"
              : roll < 0.16
                ? "PAST_DUE"
                : "ACTIVE"

      const cancelledAt =
        status === "CHURNED" ? new Date(now - between(1, 300) * DAY) : null

      const students = plan === "ENTERPRISE" || plan === "GOVERNMENT"
        ? between(1400, 3200)
        : plan === "PROFESSIONAL"
          ? between(900, 2000)
          : plan === "GROWTH"
            ? between(400, 1200)
            : between(90, 600)

      const staffCount = Math.max(6, Math.round(students / between(12, 20)))

      const gateway = pick<PaymentChannel>(["PAYSTACK", "PAYSTACK", "PAYSTACK", "FLUTTERWAVE", "REMITA", "BANK_TRANSFER"])

      const school = await prisma.school.create({
        data: {
          name,
          slug,
          state,
          city: state,
          country: "Nigeria",
          email: `admin@${slug.replace(PREFIX, "")}.ng`.slice(0, 60),
          phone: `+234 ${between(700, 909)} ${between(100, 999)} ${between(1000, 9999)}`,
          address: `${between(1, 90)} ${pick(["Adeola Odeku", "Awolowo", "Ahmadu Bello", "Ikorodu", "Aba"])} Road, ${state}`,
          accreditationNumber: `${state.slice(0, 2).toUpperCase()}/PVT/${between(2004, 2019)}/${between(1000, 9999)}`,
          isActive: status !== "CHURNED" && status !== "SUSPENDED",
          createdAt,
          subscription: {
            create: {
              plan,
              status,
              cycle,
              amount,
              seats: pricing.seats,
              startedAt: createdAt,
              trialEndsAt: status === "TRIAL" ? new Date(createdAt.getTime() + 30 * DAY) : null,
              renewsAt:
                status === "CHURNED"
                  ? null
                  : new Date(now + between(-20, 120) * DAY),
              cancelledAt,
              churnReason: status === "CHURNED" ? pick(CHURN_REASONS) : null,
              paymentMethod: pick(["Paystack · Visa ****4821", "Flutterwave · Mastercard ****7712", "Bank transfer"]),
            },
          },
        },
        select: { id: true },
      })

      // Users — lastLoginAt drives both "active schools" and the health score.
      const staleDays =
        status === "CHURNED" ? between(90, 300)
        : status === "SUSPENDED" ? between(30, 120)
        : rand() < 0.12 ? between(22, 60)
        : between(0, 12)

      await prisma.user.createMany({
        data: [
          { schoolId: school.id, email: `head.${index}@${slug}.ng`, role: "SCHOOL_ADMIN" as const, firstName: "Ada", lastName: `Admin${index}`, createdAt, lastLoginAt: new Date(now - staleDays * DAY) },
          { schoolId: school.id, email: `principal.${index}@${slug}.ng`, role: "PRINCIPAL" as const, firstName: "Folake", lastName: `Principal${index}`, createdAt, lastLoginAt: new Date(now - (staleDays + 1) * DAY) },
          { schoolId: school.id, email: `bursar.${index}@${slug}.ng`, role: "BURSAR" as const, firstName: "Emeka", lastName: `Bursar${index}`, createdAt, lastLoginAt: new Date(now - (staleDays + 3) * DAY) },
        ],
      })

      // Student and Staff are PROFILE rows keyed to a User (userId is required
      // and unique), so each one needs its user created first.
      const studentCount = Math.min(students, 30)
      await prisma.user.createMany({
        data: Array.from({ length: studentCount }, (_, i) => ({
          schoolId: school.id,
          email: `student.${index}.${i}@${slug}.ng`,
          role: "STUDENT" as const,
          firstName: `Student${i}`,
          lastName: `Demo${index}`,
          createdAt: new Date(createdAt.getTime() + i * DAY),
        })),
      })
      const studentUsers = await prisma.user.findMany({
        where: { schoolId: school.id, role: "STUDENT" },
        select: { id: true, createdAt: true },
      })
      await prisma.student.createMany({
        data: studentUsers.map((user, i) => ({
          schoolId: school.id,
          userId: user.id,
          admissionNumber: `${slug.slice(5, 14)}/${1000 + i}`,
          admissionDate: user.createdAt,
          dateOfBirth: new Date(2012, i % 12, ((i * 7) % 27) + 1),
          gender: (i % 2 === 0 ? "MALE" : "FEMALE") as "MALE" | "FEMALE",
          createdAt: user.createdAt,
        })),
      })

      const staffToMake = Math.min(staffCount, 8)
      await prisma.user.createMany({
        data: Array.from({ length: staffToMake }, (_, i) => ({
          schoolId: school.id,
          email: `teacher.${index}.${i}@${slug}.ng`,
          role: "TEACHER" as const,
          firstName: `Teacher${i}`,
          lastName: `Demo${index}`,
          createdAt,
          lastLoginAt: new Date(now - (staleDays + i) * DAY),
        })),
      })
      const staffUsers = await prisma.user.findMany({
        where: { schoolId: school.id, role: "TEACHER" },
        select: { id: true },
      })
      await prisma.staff.createMany({
        data: staffUsers.map((user, i) => ({
          schoolId: school.id,
          userId: user.id,
          staffNumber: `${slug.slice(5, 14)}/S${100 + i}`,
          hireDate: createdAt,
          createdAt,
        })),
      })

      // ── Academic records ────────────────────────────────────────
      // Without these the funnel and the adoption grid read a platform where
      // nobody has done anything, because "onboarded" and "first value" are
      // defined against classes, attendance and grades. Deliberately NOT
      // universal: the drop-off between stages has to come from somewhere
      // real, so a slice of schools stop after registration and another slice
      // finish onboarding without ever taking a register.
      const onboards = rand() < 0.82
      if (onboards) {
        const curriculum = await prisma.curriculum.create({
          data: {
            schoolId: school.id,
            code: "WAEC",
            name: "WAEC (NERDC)",
            examBodyCode: "WAEC",
            isDefault: true,
            gradingScale: WAEC_GRADING,
            midtermComponents: ["CA1", "Mid-Term"],
            createdAt,
          },
          select: { id: true },
        })

        const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 8, 1))
        const year = await prisma.academicYear.create({
          data: {
            schoolId: school.id,
            name: `${yearStart.getUTCFullYear()}/${yearStart.getUTCFullYear() + 1}`,
            startDate: yearStart,
            endDate: new Date(Date.UTC(yearStart.getUTCFullYear() + 1, 6, 31)),
            isCurrent: true,
            createdAt,
            terms: {
              create: {
                type: "FIRST",
                startDate: yearStart,
                endDate: new Date(Date.UTC(yearStart.getUTCFullYear(), 11, 15)),
                isCurrent: true,
              },
            },
          },
          select: { id: true, terms: { select: { id: true } } },
        })
        const termId = year.terms[0].id

        const staffRows = await prisma.staff.findMany({
          where: { schoolId: school.id },
          select: { id: true },
        })

        const groups: Array<{ classId: string; sectionId: string }> = []
        for (const [level, className] of [[1, "JSS 1"], [2, "JSS 2"], [3, "SS 1"]] as const) {
          const klass = await prisma.class.create({
            data: {
              schoolId: school.id,
              name: className,
              level,
              curriculumId: curriculum.id,
              createdAt,
              sections: {
                create: {
                  schoolId: school.id,
                  name: "A",
                  teacherId: staffRows[level % Math.max(1, staffRows.length)]?.id ?? null,
                  capacity: 40,
                },
              },
            },
            select: { id: true, sections: { select: { id: true } } },
          })
          groups.push({ classId: klass.id, sectionId: klass.sections[0].id })
        }

        const subjects = await Promise.all(
          [
            ["Mathematics", "MTH"],
            ["English Language", "ENG"],
            ["Basic Science", "BSC"],
            ["Civic Education", "CVE"],
          ].map(([subjectName, code]) =>
            prisma.subject.create({
              data: { schoolId: school.id, name: subjectName, code, createdAt },
              select: { id: true },
            }),
          ),
        )

        const studentRows = await prisma.student.findMany({
          where: { schoolId: school.id },
          select: { id: true },
        })

        // Enrol students across the sections so the class rosters are real.
        await prisma.enrollment.createMany({
          data: studentRows.map((student, i) => {
            const group = groups[i % groups.length]
            return {
              schoolId: school.id,
              studentId: student.id,
              classId: group.classId,
              sectionId: group.sectionId,
              academicYearId: year.id,
              enrolledOn: createdAt,
              createdAt,
            }
          }),
          skipDuplicates: true,
        })

        // First value: a register taken, or grades entered, or both.
        const usesAttendance = rand() < 0.78
        const usesGrades = rand() < 0.7

        if (usesAttendance) {
          const days = between(3, 10)
          const rows: Array<{
            schoolId: string
            studentId: string
            sectionId: string
            termId: string
            date: Date
            status: "PRESENT" | "ABSENT" | "LATE"
          }> = []
          for (let d = 0; d < days; d++) {
            // Weekdays only, walking back from today.
            const date = new Date(now - (d + 1) * DAY)
            if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue
            date.setUTCHours(0, 0, 0, 0)
            for (const [i, student] of studentRows.entries()) {
              const roll = rand()
              rows.push({
                schoolId: school.id,
                studentId: student.id,
                sectionId: groups[i % groups.length].sectionId,
                termId,
                date,
                status: roll < 0.9 ? "PRESENT" : roll < 0.96 ? "ABSENT" : "LATE",
              })
            }
          }
          // studentId + date is unique, so a repeated date is skipped rather
          // than failing the whole seed.
          await prisma.attendance.createMany({ data: rows, skipDuplicates: true })
        }

        if (usesGrades) {
          const graded = studentRows.slice(0, Math.min(studentRows.length, 20))
          await prisma.grade.createMany({
            data: graded.flatMap((student) =>
              subjects.map((subject) => {
                const ca = between(12, 38)
                const exam = between(24, 58)
                return {
                  schoolId: school.id,
                  studentId: student.id,
                  subjectId: subject.id,
                  termId,
                  caScore: ca,
                  examScore: exam,
                  totalScore: ca + exam,
                  caComponents: { CA1: Math.round(ca / 4), CA2: Math.round(ca / 4), "Mid-Term": Math.round(ca / 4), Assignment: ca - 3 * Math.round(ca / 4) },
                  createdAt: new Date(now - between(1, 40) * DAY),
                }
              }),
            ),
            skipDuplicates: true,
          })
        }
      }

      // Usage snapshots for the last six months, so the Usage tab has data.
      const scale = students / 800
      await prisma.schoolUsageSnapshot.createMany({
        data: Array.from({ length: 6 }, (_, i) => {
          const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (5 - i), 1))
          return {
            schoolId: school.id,
            month,
            apiCalls: Math.round(between(280_000, 560_000) * scale),
            storageMb: Math.round(between(1800, 4600) * scale),
            smsSent: Math.round(between(6_000, 13_000) * scale),
            logins: Math.round(between(7_000, 13_000) * scale),
            studentsAdded: between(0, 18),
            feesProcessed: Math.round(between(2_000_000, 15_000_000) * scale),
          }
        }),
      })

      // ── Subscription billing history ──
      // One charge per billing period since the school joined, so the revenue
      // charts, transaction log and failed-payments queue all have real rows.
      const subscription = await prisma.schoolSubscription.findUnique({
        where: { schoolId: school.id },
        select: { id: true },
      })

      const periodDays = cycle === "MONTHLY" ? 30 : cycle === "TERMLY" ? 91 : 365
      const periods = Math.min(8, Math.floor(ageDays / periodDays))
      const monthlyEquivalent =
        cycle === "MONTHLY" ? amount : cycle === "TERMLY" ? amount / 3 : amount / 12

      for (let p = 0; p < periods; p++) {
        const periodStart = new Date(createdAt.getTime() + p * periodDays * DAY)
        const periodEnd = new Date(periodStart.getTime() + periodDays * DAY)
        const isLatest = p === periods - 1

        // Trials are not charged; a slice of the most recent charges failed.
        if (status === "TRIAL") continue
        const failed =
          (status === "PAST_DUE" && isLatest) ||
          (status === "SUSPENDED" && isLatest) ||
          (rand() < 0.05 && !isLatest)

        const txnStatus: TransactionStatus = failed ? "FAILED" : "SUCCESSFUL"

        await prisma.subscriptionTransaction.create({
          data: {
            schoolId: school.id,
            subscriptionId: subscription?.id ?? null,
            description: `${plan.charAt(0)}${plan.slice(1).toLowerCase()} subscription — ${cycle.toLowerCase()}`,
            amount,
            gateway,
            status: txnStatus,
            reference: `EDU-${slug.slice(5, 12).toUpperCase()}-${p + 1}-${index}`,
            gatewayRef: failed ? null : `${gateway.slice(0, 3).toLowerCase()}_${between(100000, 999999)}${index}${p}`,
            failureReason: failed
              ? pick([
                  "Insufficient funds",
                  "Card declined by issuer",
                  "Card expired",
                  "Transaction limit exceeded",
                  "Mandate not authorised",
                ])
              : null,
            attempts: failed ? between(1, 3) : 1,
            lastAttemptAt: failed ? periodStart : null,
            periodStart,
            periodEnd,
            dueDate: periodStart,
            paidAt: failed ? null : new Date(periodStart.getTime() + between(0, 3) * DAY),
            createdAt: periodStart,
          },
        })
      }

      // Revision history for the schools that changed plan mid-life, so net
      // revenue retention has expansion and contraction to separate.
      if (subscription && periods >= 3 && rand() < 0.3) {
        const upgrade = rand() < 0.65
        const factor = upgrade ? 1.6 : 0.65
        await prisma.subscriptionRevision.create({
          data: {
            subscriptionId: subscription.id,
            schoolId: school.id,
            kind: upgrade ? "UPGRADE" : "DOWNGRADE",
            fromPlan: plan,
            toPlan: plan,
            fromMonthly: Math.round(monthlyEquivalent / factor),
            toMonthly: Math.round(monthlyEquivalent),
            effectiveAt: new Date(createdAt.getTime() + Math.floor(periods / 2) * periodDays * DAY),
            note: upgrade ? "Seeded expansion" : "Seeded contraction",
          },
        })
      }

      if (status === "CHURNED" && subscription && cancelledAt) {
        await prisma.subscriptionRevision.create({
          data: {
            subscriptionId: subscription.id,
            schoolId: school.id,
            kind: "CHURN",
            fromPlan: plan,
            toPlan: plan,
            fromMonthly: Math.round(monthlyEquivalent),
            toMonthly: 0,
            effectiveAt: cancelledAt,
          },
        })
      }

      // A CRM note on roughly a third of schools.
      if (admin && rand() < 0.35) {
        await prisma.schoolCrmNote.create({
          data: {
            schoolId: school.id,
            authorId: admin.id,
            category: pick(["SALES", "SUPPORT", "CALL", "ONBOARDING"] as const),
            body: pick([
              "Renewal call — principal confirmed intent to renew and asked about a second campus.",
              "Bulk report-card export timed out for SS3; fixed and confirmed working.",
              "Onboarding session completed with the bursar. Fees module now in use.",
              "Asked about Cambridge stream pricing. Quote sent, awaiting response.",
            ]),
            createdAt: new Date(now - between(2, 90) * DAY),
          },
        })
      }

      // A support ticket on roughly a fifth, with a life of its own: some are
      // answered inside target, some late, some never — otherwise every SLA
      // timer in the console would read the same and prove nothing.
      if (rand() < 0.2) {
        const priority = rand() < 0.15 ? "CRITICAL" : pick(["LOW", "MEDIUM", "HIGH"] as const)
        const openedAt = new Date(now - between(1, 45) * DAY)
        const agent = agents.length > 0 ? pick(agents) : null

        // Roughly one in six is deliberately left to breach its target.
        const neglected = rand() < 0.17
        const targetHours = SLA_FIRST_RESPONSE[priority]
        const responseHours = neglected ? targetHours * between(3, 8) : targetHours * (0.2 + rand() * 0.6)
        const respondedAt =
          rand() < 0.85 ? new Date(openedAt.getTime() + responseHours * 3_600_000) : null

        const resolved = respondedAt !== null && rand() < 0.55
        const resolvedAt = resolved
          ? new Date(respondedAt!.getTime() + between(1, 60) * 3_600_000)
          : null

        const status = resolved
          ? (pick(["RESOLVED", "CLOSED"] as const) as "RESOLVED" | "CLOSED")
          : respondedAt
            ? (pick(["IN_PROGRESS", "WAITING_ON_CLIENT"] as const) as
                | "IN_PROGRESS"
                | "WAITING_ON_CLIENT")
            : ("OPEN" as const)

        const ticket = await prisma.supportTicket.create({
          data: {
            schoolId: school.id,
            title: pick([
              "SMS delivery failing for parents",
              "Cannot export term report cards",
              "Attendance register not saving",
              "Invoice totals look wrong",
              "Paystack payment not reflecting on the invoice",
              "Teacher cannot see her assigned classes",
            ]),
            description: "Reported by the school admin through the in-app help widget.",
            category: pick(["TECHNICAL", "BILLING", "ACCOUNT"] as const),
            priority,
            status,
            assignedTo: agent?.id ?? null,
            createdAt: openedAt,
            firstResponseAt: respondedAt,
            resolvedAt,
            escalatedAt:
              priority === "CRITICAL" && neglected
                ? new Date(openedAt.getTime() + targetHours * 2 * 3_600_000)
                : null,
          },
          select: { id: true },
        })

        if (respondedAt && agent) {
          await prisma.ticketComment.create({
            data: {
              ticketId: ticket.id,
              authorId: agent.id,
              body: pick([
                "Thanks for flagging this — I can reproduce it on your account and I am looking now.",
                "We have found the cause. A fix is going out with tonight's release.",
                "Could you confirm which term you were viewing when this happened?",
              ]),
              isInternal: false,
              createdAt: respondedAt,
            },
          })

          // An internal note on some tickets so the amber styling has a subject.
          if (rand() < 0.4) {
            await prisma.ticketComment.create({
              data: {
                ticketId: ticket.id,
                authorId: agent.id,
                body: pick([
                  "Root cause is the term-resolution helper picking isCurrent instead of the date. Ticketed with engineering.",
                  "School is on an older plan — do not promise the bulk export until they upgrade.",
                  "Second report of this from the same state. Worth checking the SMS route.",
                ]),
                isInternal: true,
                createdAt: new Date(respondedAt.getTime() + 20 * 60_000),
              },
            })
          }
        }
      }

      // NPS responses — a school that has been on the platform a while gets a
      // handful across different roles.
      if (rand() < 0.45) {
        const responses = between(1, 4)
        for (let n = 0; n < responses; n++) {
          const role = pick(["SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT"] as const)
          // Skew positive but not implausibly so.
          const score = rand() < 0.55 ? between(9, 10) : rand() < 0.75 ? between(7, 8) : between(2, 6)
          await prisma.npsResponse.create({
            data: {
              schoolId: school.id,
              role,
              score,
              comment:
                rand() < 0.6
                  ? score >= 9
                    ? pick([
                        "Attendance and result entry are far faster than our old register.",
                        "Parents love the SMS updates. Support has been responsive.",
                        "Report card templates saved us a whole week at the end of term.",
                      ])
                    : score >= 7
                      ? pick([
                          "Works well overall, but the fees module takes some getting used to.",
                          "Good product. The mobile experience could be smoother.",
                        ])
                      : pick([
                          "SMS credits run out too quickly and delivery is slow.",
                          "The timetable module keeps clashing periods for our teachers.",
                          "Training was rushed. Half our staff still cannot use it.",
                        ])
                  : null,
              createdAt: new Date(now - between(1, 330) * DAY),
            },
          })
        }
      }

      created += 1
    }
  }

  // A handful of refunds against settled charges, so the refund log is not empty.
  const refundable = await prisma.subscriptionTransaction.findMany({
    where: { status: "SUCCESSFUL", school: { slug: { startsWith: PREFIX } } },
    orderBy: { paidAt: "desc" },
    take: 6,
    select: { id: true, schoolId: true, amount: true },
  })
  if (admin) {
    for (const [i, txn] of refundable.entries()) {
      const partial = i % 2 === 0
      const amount = partial ? Math.round(Number(txn.amount) / 2) : Number(txn.amount)
      await prisma.subscriptionRefund.create({
        data: {
          transactionId: txn.id,
          schoolId: txn.schoolId,
          originalAmount: txn.amount,
          amount,
          reason: pick(["REQUEST", "DUPLICATE", "ERROR", "GOODWILL"] as const),
          status: "APPROVED",
          note: "Seeded refund — recorded in the ledger only.",
          requestedById: admin.id,
          approvedById: admin.id,
          approvedAt: new Date(),
          gatewaySent: false,
        },
      })
      await prisma.subscriptionTransaction.update({
        where: { id: txn.id },
        data: { status: partial ? "PARTIALLY_REFUNDED" : "REFUNDED" },
      })
    }
  }

  // A couple of past broadcasts so the history table is not empty.
  if (admin) {
    const targeted = await prisma.school.count({
      where: { slug: { startsWith: PREFIX }, subscription: { is: { plan: "STARTER" } } },
    })
    await prisma.broadcast.createMany({
      data: [
        {
          title: "[demo] Scheduled maintenance this Saturday",
          body: "EduCore will be unavailable between 01:00 and 03:00 WAT on Saturday while we upgrade the database.",
          audience: "ALL",
          audienceFilter: {},
          channels: ["IN_APP", "EMAIL"],
          status: "SENT",
          schoolCount: created,
          recipientCount: created * 2,
          inAppSent: created * 2,
          sentAt: new Date(now - 9 * DAY),
          createdById: admin.id,
        },
        {
          title: "[demo] Starter plan now includes the library module",
          body: "From this term, schools on the Starter plan get the library module at no extra cost.",
          audience: "BY_PLAN",
          audienceFilter: { plans: ["STARTER"] },
          channels: ["IN_APP"],
          status: "SENT",
          schoolCount: targeted,
          recipientCount: targeted * 2,
          inAppSent: targeted * 2,
          sentAt: new Date(now - 3 * DAY),
          createdById: admin.id,
        },
      ],
    })
  }

  const npsCount = await prisma.npsResponse.count({
    where: { school: { slug: { startsWith: PREFIX } } },
  })
  const commentCount = await prisma.ticketComment.count({
    where: { ticket: { school: { slug: { startsWith: PREFIX } } } },
  })

  const txnCount = await prisma.subscriptionTransaction.count({
    where: { school: { slug: { startsWith: PREFIX } } },
  })
  console.log(`Created ${created} demo schools with subscriptions, users, students, staff, usage, notes and tickets.`)
  console.log(`Plus ${txnCount} subscription charges, ${refundable.length} refunds and revision history.`)
  console.log(`Plus ${npsCount} NPS responses, ${commentCount} ticket comments and 2 broadcasts.`)
  console.log("Run with --undo to remove them.")
}

async function main() {
  if (process.argv.includes("--undo")) await undo()
  else await create()
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
