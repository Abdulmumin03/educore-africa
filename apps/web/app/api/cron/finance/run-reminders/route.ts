import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { sendSms } from "@/lib/sms"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

// Reminder offsets in days from due date. Negative = before, positive = after.
// Each scheduled offset fires once per invoice (dedupe via Notification metadata).
const OFFSETS = [-7, 0, 7, 14] as const
type Offset = (typeof OFFSETS)[number]

const MAX_PER_RUN = 500

function offsetLabel(offset: Offset): string {
  if (offset < 0) return `${Math.abs(offset)} days before due`
  if (offset === 0) return "due today"
  return `${offset} days overdue`
}

function dayAt(offsetDays: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d
}

/**
 * Cron entrypoint: scan PENDING/PARTIAL/OVERDUE invoices and send SMS
 * reminders to primary guardians at -7 / 0 / +7 / +14 days from due date.
 * Deduplicates by inspecting Notification metadata for a prior reminder with
 * the same (invoiceId, offset).
 *
 * Suggested cadence: once daily, e.g.
 *
 *   Vercel `vercel.json`:
 *     { "crons": [{ "path": "/api/cron/finance/run-reminders", "schedule": "0 8 * * *" }] }
 *
 *   Self-hosted (crontab):
 *     0 8 * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" \
 *       https://app.educore.africa/api/cron/finance/run-reminders >/dev/null
 */
async function handle(req: Request) {
  const expected = process.env.CRON_SECRET
  if (expected) {
    const header = req.headers.get("x-cron-secret")
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (header !== expected && bearer !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }

  const results: Array<{ offset: Offset; targeted: number; sent: number; skipped: number }> = []

  for (const offset of OFFSETS) {
    // Invoices whose dueDate equals "today minus offset" → if offset=-7 we want
    // invoices due in 7 days; if offset=7 we want invoices that were due 7 days ago.
    // Match on date column (already @db.Date) — exact day boundary.
    const targetDate = dayAt(-offset)
    const dayAfter = new Date(targetDate)
    dayAfter.setDate(dayAfter.getDate() + 1)

    const invoices = await prisma.feeInvoice.findMany({
      where: {
        deletedAt: null,
        dueDate: { gte: targetDate, lt: dayAfter },
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      },
      take: MAX_PER_RUN,
      include: {
        student: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            parents: {
              where: { isPrimary: true },
              include: { parent: { include: { user: { select: { phone: true, id: true } } } } },
            },
          },
        },
        school: { select: { id: true, name: true } },
      },
    })

    let sent = 0
    let skipped = 0
    for (const inv of invoices) {
      const balance = Math.max(0, Number(inv.amountDue) - Number(inv.amountPaid))
      if (balance <= 0) {
        skipped += 1
        continue
      }
      const primary = inv.student.parents[0]?.parent
      if (!primary?.user.phone) {
        skipped += 1
        continue
      }

      // Dedupe: have we already sent THIS offset for THIS invoice?
      const prior = await prisma.notification.findFirst({
        where: {
          userId: primary.user.id,
          channel: "SMS",
          title: "Fee reminder",
          metadata: {
            path: ["invoiceId"],
            equals: inv.id,
          } as never,
        },
        select: { id: true, metadata: true, createdAt: true },
      })
      // Need a tighter check — look at offset in metadata.
      const alreadySent = await prisma.notification.findFirst({
        where: {
          schoolId: inv.school.id,
          userId: primary.user.id,
          channel: "SMS",
          title: "Fee reminder",
          AND: [
            { metadata: { path: ["invoiceId"], equals: inv.id } as never },
            { metadata: { path: ["offset"], equals: offset } as never },
          ],
        },
        select: { id: true },
      })
      if (alreadySent) {
        skipped += 1
        continue
      }
      // Silence unused variable warning — prior fetched as a sanity probe but
      // the AND-filter above is the real dedupe.
      void prior

      const studentName = `${inv.student.user.firstName} ${inv.student.user.lastName}`
      const message =
        `${inv.school.name}: ${studentName} has NGN ${balance.toLocaleString()} outstanding ` +
        `on invoice ${inv.invoiceNo} (${offsetLabel(offset)}). Please settle to avoid disruption.`

      const result = await sendSms(primary.user.phone, message)
      if (result.ok) {
        sent += 1
        await prisma.notification.create({
          data: {
            schoolId: inv.school.id,
            userId: primary.user.id,
            channel: "SMS",
            title: "Fee reminder",
            body: message,
            metadata: { invoiceId: inv.id, balance, offset },
            sentAt: new Date(),
          },
        })
      } else {
        skipped += 1
      }
    }

    results.push({ offset, targeted: invoices.length, sent, skipped })
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    results,
    totalSent: results.reduce((acc, r) => acc + r.sent, 0),
  })
}

export const POST = handle
export const GET = handle
