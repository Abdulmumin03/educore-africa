/**
 * SA-08 platform configuration seed.
 *
 * Separate from seed-demo because this is NOT demo data: message templates,
 * feature flags and the plan catalogue are things the platform genuinely needs
 * to have. Running it is idempotent — every row is upserted by its natural key,
 * so it can be re-run after a schema change without duplicating anything.
 *
 * The sales pipeline and NDPR rows ARE illustrative, and are only written when
 * `--with-samples` is passed, so a production run does not invent leads.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const withSamples = process.argv.includes("--with-samples")

const DAY = 86_400_000

const EMAIL_TEMPLATES = [
  {
    key: "welcome",
    label: "Welcome",
    description: "Sent the moment a school finishes registration.",
    subject: "Welcome to EduCore Africa, {{school_name}}",
    body: `<p>Dear {{admin_name}},</p>
<p>{{school_name}} is set up on EduCore Africa. You are on the {{plan_name}} plan.</p>
<p>Sign in here to add your students and staff: <a href="{{login_url}}">{{login_url}}</a></p>
<p>Any questions, reply to this message or write to {{support_email}}.</p>
<p>— The EduCore Africa team</p>`,
    mergeTags: ["school_name", "admin_name", "plan_name", "login_url", "support_email"],
  },
  {
    key: "invoice",
    label: "Invoice issued",
    description: "Sent when a subscription invoice is raised.",
    subject: "Invoice {{invoice_number}} for {{school_name}}",
    body: `<p>Dear {{admin_name}},</p>
<p>Invoice {{invoice_number}} for {{amount}} is now due on {{due_date}}.</p>
<p>You can pay from your dashboard: <a href="{{login_url}}">{{login_url}}</a></p>
<p>— EduCore Africa Billing</p>`,
    mergeTags: ["school_name", "admin_name", "amount", "due_date", "invoice_number", "login_url"],
  },
  {
    key: "renewal_reminder",
    label: "Renewal reminder",
    description: "Sent before a subscription term ends.",
    subject: "{{school_name}} — your EduCore term ends on {{due_date}}",
    body: `<p>Dear {{admin_name}},</p>
<p>Your {{plan_name}} subscription runs to {{due_date}}. Renewing keeps attendance, results and fee collection running without interruption.</p>
<p>Renew from your dashboard: <a href="{{login_url}}">{{login_url}}</a></p>
<p>— EduCore Africa</p>`,
    mergeTags: ["school_name", "admin_name", "plan_name", "due_date", "login_url"],
  },
  {
    key: "password_reset",
    label: "Password reset",
    description: "Sent when a school user asks to reset their password.",
    subject: "Reset your EduCore password",
    body: `<p>Dear {{admin_name}},</p>
<p>Use the link below to set a new password. It expires in one hour.</p>
<p><a href="{{login_url}}">{{login_url}}</a></p>
<p>If you did not ask for this, ignore this message and nothing changes.</p>`,
    mergeTags: ["admin_name", "login_url"],
  },
  {
    key: "suspension_notice",
    label: "Suspension notice",
    description: "Sent when an account is suspended for non-payment.",
    subject: "Action needed: {{school_name}} access has been suspended",
    body: `<p>Dear {{admin_name}},</p>
<p>Access for {{school_name}} has been suspended because invoice {{invoice_number}} for {{amount}} is outstanding since {{due_date}}.</p>
<p>Your data is safe and nothing has been deleted. Settling the invoice restores access immediately.</p>
<p>If this is a mistake, write to {{support_email}} and we will sort it out.</p>`,
    mergeTags: [
      "school_name",
      "admin_name",
      "amount",
      "due_date",
      "invoice_number",
      "support_email",
    ],
  },
]

const SMS_TEMPLATES = [
  {
    key: "welcome",
    label: "Welcome",
    description: "Sent to the school administrator at registration.",
    // Deliberately inside one 160-character segment at sample values.
    body: "EduCore: {{school_name}} is set up. Sign in at {{login_url}} to add your students. Help: {{support_email}}",
    mergeTags: ["school_name", "login_url", "support_email"],
  },
  {
    key: "invoice",
    label: "Invoice issued",
    description: "Sent when a subscription invoice is raised.",
    body: "EduCore: invoice {{invoice_number}} for {{amount}} is due {{due_date}}. Pay from your dashboard.",
    mergeTags: ["amount", "due_date", "invoice_number"],
  },
  {
    key: "renewal_reminder",
    label: "Renewal reminder",
    description: "Sent before a subscription term ends.",
    body: "EduCore: your {{plan_name}} plan for {{school_name}} ends {{due_date}}. Renew to keep attendance and results running.",
    mergeTags: ["school_name", "plan_name", "due_date"],
  },
  {
    key: "suspension_notice",
    label: "Suspension notice",
    description: "Sent when an account is suspended for non-payment.",
    body: "EduCore: access for {{school_name}} is suspended over unpaid invoice {{invoice_number}}. Your data is safe. Settle to restore.",
    mergeTags: ["school_name", "invoice_number"],
  },
]

const FLAGS = [
  {
    key: "new_report_designer",
    label: "New report-card designer",
    description: "The rebuilt template editor, behind a flag while it settles.",
    scope: "BY_PLAN" as const,
    scopeValues: ["PROFESSIONAL", "ENTERPRISE"],
    rollout: 100,
    enabled: false,
  },
  {
    key: "ai_lesson_plans",
    label: "AI lesson plans",
    description: "Claude-drafted lesson plans in the LMS.",
    scope: "GLOBAL" as const,
    scopeValues: [],
    rollout: 25,
    enabled: false,
  },
  {
    key: "parent_mobile_wallet",
    label: "Parent mobile wallet",
    description: "Wallet top-ups for fee payment. Pilot only.",
    scope: "BY_STATE" as const,
    scopeValues: ["Lagos"],
    rollout: 100,
    enabled: false,
  },
  {
    key: "ussd_result_checking",
    label: "USSD result checking",
    description: "Parents check results over USSD without data.",
    scope: "GLOBAL" as const,
    scopeValues: [],
    rollout: 100,
    enabled: true,
  },
]

async function templates() {
  for (const template of EMAIL_TEMPLATES) {
    await prisma.messageTemplate.upsert({
      where: { kind_key: { kind: "EMAIL", key: template.key } },
      // Never clobber wording somebody edited in the console.
      update: { label: template.label, description: template.description, mergeTags: template.mergeTags },
      create: { kind: "EMAIL", ...template },
    })
  }

  for (const template of SMS_TEMPLATES) {
    await prisma.messageTemplate.upsert({
      where: { kind_key: { kind: "SMS", key: template.key } },
      update: { label: template.label, description: template.description, mergeTags: template.mergeTags },
      create: { kind: "SMS", subject: null, ...template },
    })
  }

  console.log(`Templates: ${EMAIL_TEMPLATES.length} email, ${SMS_TEMPLATES.length} SMS.`)
}

async function flags(createdById: string | null) {
  for (const flag of FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      // Only metadata is refreshed: re-running the seed must not flip a flag
      // somebody deliberately turned on or off.
      update: { label: flag.label, description: flag.description },
      create: { ...flag, defaultValue: false, createdById },
    })
  }
  console.log(`Feature flags: ${FLAGS.length}.`)
}

async function promos(createdById: string | null) {
  const codes = [
    {
      code: "TERM1-2026",
      discountType: "PERCENT" as const,
      discountValue: 15,
      plans: [],
      expiresAt: new Date(Date.now() + 60 * DAY),
      maxUses: 100,
      note: "First-term intake campaign.",
    },
    {
      code: "LAGOS-PILOT",
      discountType: "FIXED" as const,
      discountValue: 50000,
      plans: ["GROWTH" as const, "PROFESSIONAL" as const],
      expiresAt: new Date(Date.now() + 30 * DAY),
      maxUses: 25,
      note: "Lagos state pilot cohort.",
    },
    {
      code: "EXPIRED-DEMO",
      discountType: "PERCENT" as const,
      discountValue: 50,
      plans: [],
      expiresAt: new Date(Date.now() - 5 * DAY),
      maxUses: null,
      note: "Left expired on purpose so the validator has a failing case.",
    },
  ]

  for (const code of codes) {
    await prisma.promoCode.upsert({
      where: { code: code.code },
      update: {},
      create: { ...code, createdById },
    })
  }
  console.log(`Promo codes: ${codes.length}.`)
}

async function samples(createdById: string | null) {
  if (!withSamples) {
    console.log("Skipped sample leads, referrals and NDPR rows (pass --with-samples to include them).")
    return
  }

  const existing = await prisma.lead.count()
  if (existing === 0) {
    const LEADS = [
      { schoolName: "Crescent Heights Academy", contactName: "Musa Bello", state: "Kano", sizeEstimate: 640, source: "Referral", stage: "NEW" as const },
      { schoolName: "Harmony Grove Schools", contactName: "Ngozi Eze", state: "Enugu", sizeEstimate: 1200, source: "Website", stage: "NEW" as const },
      { schoolName: "Silverline College", contactName: "Tunde Ajayi", state: "Lagos", sizeEstimate: 2100, source: "Conference", stage: "CONTACTED" as const },
      { schoolName: "Northgate International", contactName: "Aisha Sani", state: "Kaduna", sizeEstimate: 880, source: "Cold call", stage: "CONTACTED" as const },
      { schoolName: "Riverside Model School", contactName: "Emeka Obi", state: "Rivers", sizeEstimate: 460, source: "Website", stage: "DEMO_SCHEDULED" as const },
      { schoolName: "Palm Valley Academy", contactName: "Folake Adeniyi", state: "Ogun", sizeEstimate: 1500, source: "Referral", stage: "TRIAL_STARTED" as const },
      { schoolName: "Cedarwood Schools", contactName: "Ibrahim Yusuf", state: "FCT", sizeEstimate: 3200, source: "Partner", stage: "CONVERTED" as const },
      { schoolName: "Bluecrest Academy", contactName: "Chika Nwosu", state: "Abia", sizeEstimate: 300, source: "Website", stage: "LOST" as const, lostReason: "Chose a cheaper local vendor." },
    ]

    for (const [index, lead] of LEADS.entries()) {
      await prisma.lead.create({
        data: {
          ...lead,
          contactEmail: `${lead.contactName.split(" ")[0].toLowerCase()}@${lead.schoolName
            .toLowerCase()
            .replace(/[^a-z]/g, "")
            .slice(0, 12)}.ng`,
          contactPhone: `+234 80${index} ${100 + index} ${4000 + index}`,
          ownerId: createdById,
          position: (index + 1) * 1000,
          stageChangedAt: new Date(Date.now() - (index * 3 + 1) * DAY),
          createdAt: new Date(Date.now() - (index * 5 + 7) * DAY),
        },
      })
    }
    console.log(`Leads: ${LEADS.length}.`)
  } else {
    console.log(`Leads: ${existing} already present, left alone.`)
  }

  // Referral codes for a couple of real schools, so the tab is not empty.
  const referralCount = await prisma.referral.count()
  if (referralCount === 0) {
    const schools = await prisma.school.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      take: 3,
      select: { id: true, name: true },
    })

    for (const [index, school] of schools.entries()) {
      const stem = school.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4).padEnd(4, "X")
      await prisma.referral.create({
        data: {
          referrerSchoolId: school.id,
          code: `${stem}-SEED${index}`,
          status: "PENDING",
          createdById,
        },
      })
    }
    console.log(`Referrals: ${schools.length} codes issued.`)
  } else {
    console.log(`Referrals: ${referralCount} already present, left alone.`)
  }

  const requestCount = await prisma.dataSubjectRequest.count()
  if (requestCount === 0) {
    // A DELETION request has to point at a real account to be executable — but
    // NEVER at an arbitrary one. Picking "any parent" would stage a real
    // person for erasure, and somebody clicking through the demo would erase
    // them. Only a demo-seeded account qualifies; if there is none, the
    // deletion row is created unlinked and the console will refuse to execute
    // it until a subject is identified.
    const subject = await prisma.user.findFirst({
      where: {
        deletedAt: null,
        role: "PARENT",
        school: { slug: { startsWith: "demo-" } },
      },
      select: { id: true, email: true, firstName: true, lastName: true, schoolId: true },
    })
    if (!subject) {
      console.log("  No demo parent found — the deletion request will be logged without a subject.")
    }

    const rows = [
      {
        type: "ACCESS" as const,
        status: "IN_PROGRESS" as const,
        subjectName: "Adaeze Okonkwo",
        subjectEmail: "adaeze.okonkwo@example.ng",
        details: "Asked for a copy of everything held about her two children.",
        daysAgo: 6,
      },
      {
        type: "PORTABILITY" as const,
        status: "RECEIVED" as const,
        subjectName: "Samuel Adeyemi",
        subjectEmail: "s.adeyemi@example.ng",
        details: "Moving schools; wants results and attendance in a portable format.",
        daysAgo: 2,
      },
      {
        type: "DELETION" as const,
        status: "RECEIVED" as const,
        subjectName: subject ? `${subject.firstName} ${subject.lastName}` : "Halima Bala",
        subjectEmail: subject?.email ?? "halima.bala@example.ng",
        details: "Left the platform and asked for her record to be erased.",
        daysAgo: 26,
        userId: subject?.id ?? null,
        schoolId: subject?.schoolId ?? null,
      },
    ]

    for (const row of rows) {
      const receivedAt = new Date(Date.now() - row.daysAgo * DAY)
      await prisma.dataSubjectRequest.create({
        data: {
          type: row.type,
          status: row.status,
          subjectName: row.subjectName,
          subjectEmail: row.subjectEmail,
          details: row.details,
          userId: "userId" in row ? row.userId : null,
          schoolId: "schoolId" in row ? row.schoolId : null,
          receivedAt,
          dueAt: new Date(receivedAt.getTime() + 30 * DAY),
        },
      })
    }
    console.log(`NDPR requests: ${rows.length} (one deletion is 26 days old, so the clock is amber).`)
  } else {
    console.log(`NDPR requests: ${requestCount} already present, left alone.`)
  }

  const announcementCount = await prisma.platformAnnouncement.count()
  if (announcementCount === 0 && createdById) {
    await prisma.platformAnnouncement.create({
      data: {
        title: "Result upload opens on Monday",
        body: "End-of-term result entry opens on Monday for every school. The gradebook stays editable until the term is locked.",
        type: "INFO",
        startsAt: new Date(Date.now() - DAY),
        endsAt: new Date(Date.now() + 10 * DAY),
        createdById,
      },
    })
    console.log("Announcements: 1.")
  }
}

async function main() {
  const admin = await prisma.superAdminUser.findFirst({ select: { id: true } })

  await templates()
  await flags(admin?.id ?? null)
  await promos(admin?.id ?? null)
  await samples(admin?.id ?? null)

  const plans = await prisma.planConfig.count()
  console.log(`Plan catalogue: ${plans} plans (seeded by the SA-08 migration).`)
  console.log("Done.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
