import africastalking from "africastalking"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

const SENDER_ID = process.env.AFRICASTALKING_SENDER_ID // optional alphanumeric

type AfricasTalkingSmsResponse = {
  SMSMessageData?: {
    Recipients?: {
      number: string
      status: string
      statusCode: number
      messageId: string
      cost: string
    }[]
  }
}

function client() {
  return africastalking({
    apiKey: process.env.AFRICASTALKING_API_KEY ?? "",
    username: process.env.AFRICASTALKING_USERNAME ?? "sandbox",
  }).SMS
}

function smsConfigured(): boolean {
  return !!process.env.AFRICASTALKING_API_KEY && !!process.env.AFRICASTALKING_USERNAME
}

export type SendSmsResult = { ok: true; data: unknown } | { ok: false; error: string }

export async function sendSms(toE164: string, message: string): Promise<SendSmsResult> {
  if (!smsConfigured()) {
    console.warn("[sms] AT not configured — would have sent:", { toE164, message })
    return { ok: false, error: "SMS provider not configured" }
  }
  try {
    const sms = client()
    const data = await sms.send({
      to: [toE164],
      message,
      ...(SENDER_ID ? { from: SENDER_ID } : {}),
    } as never)
    return { ok: true, data }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown SMS failure"
    console.error("[sms] failed", error)
    return { ok: false, error }
  }
}

export type BulkRecipient = {
  phone: string
  userId?: string | null
}

export type BulkSmsResult = {
  ok: boolean
  batchId: string | null
  totalCount: number
  deliveredCount: number
  failedCount: number
  error?: string
}

/**
 * Send the same SMS to many recipients. Writes an SmsBatch row for tracking
 * plus one SmsLog per recipient. Chunks recipients into groups of 100 (AT's
 * recommended max-per-request) and updates batch totals as it goes.
 *
 * When `audienceLabel` is provided we keep it on the batch row for the UI.
 */
export async function sendBulkSms(
  schoolId: string,
  recipients: BulkRecipient[],
  message: string,
  opts: {
    senderId?: string | null
    audienceLabel?: string
    audienceFilter?: Prisma.InputJsonValue
    scheduledAt?: Date | null
  } = {},
): Promise<BulkSmsResult> {
  const unique = dedupeByPhone(recipients)
  if (unique.length === 0) {
    return { ok: false, batchId: null, totalCount: 0, deliveredCount: 0, failedCount: 0, error: "No recipients" }
  }

  const batch = await prisma.smsBatch.create({
    data: {
      schoolId,
      senderId: opts.senderId ?? null,
      audienceLabel: opts.audienceLabel ?? `${unique.length} recipients`,
      audienceFilter: opts.audienceFilter,
      message,
      status: opts.scheduledAt ? "SCHEDULED" : "SENDING",
      scheduledAt: opts.scheduledAt ?? null,
      totalCount: unique.length,
    },
  })

  // If scheduled for later, just leave SCHEDULED and return. A worker / cron
  // would pick it up — see /api/cron/sms-dispatch (P09).
  if (opts.scheduledAt && opts.scheduledAt.getTime() > Date.now()) {
    await prisma.smsLog.createMany({
      data: unique.map((r) => ({
        schoolId,
        batchId: batch.id,
        recipientUserId: r.userId ?? null,
        phone: r.phone,
        message,
        status: "QUEUED" as const,
      })),
    })
    return {
      ok: true,
      batchId: batch.id,
      totalCount: unique.length,
      deliveredCount: 0,
      failedCount: 0,
    }
  }

  if (!smsConfigured()) {
    // Without a provider, simulate: write logs as FAILED with a clear reason
    // so analytics still has data and the UI knows nothing left the building.
    await prisma.smsLog.createMany({
      data: unique.map((r) => ({
        schoolId,
        batchId: batch.id,
        recipientUserId: r.userId ?? null,
        phone: r.phone,
        message,
        status: "FAILED" as const,
        errorMessage: "SMS provider not configured",
      })),
    })
    await prisma.smsBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", failedCount: unique.length, sentAt: new Date() },
    })
    return {
      ok: false,
      batchId: batch.id,
      totalCount: unique.length,
      deliveredCount: 0,
      failedCount: unique.length,
      error: "SMS provider not configured",
    }
  }

  let delivered = 0
  let failed = 0
  const sms = client()
  const CHUNK_SIZE = 100

  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE)
    try {
      const data = (await sms.send({
        to: chunk.map((r) => r.phone),
        message,
        ...(SENDER_ID ? { from: SENDER_ID } : {}),
      } as never)) as AfricasTalkingSmsResponse
      const recipients = data?.SMSMessageData?.Recipients ?? []
      const byPhone = new Map(recipients.map((r) => [r.number, r]))
      const logs = chunk.map((r) => {
        const result = byPhone.get(r.phone)
        const ok = result?.statusCode === 100 || result?.statusCode === 101
        return {
          schoolId,
          batchId: batch.id,
          recipientUserId: r.userId ?? null,
          phone: r.phone,
          message,
          status: (ok ? "SENT" : "FAILED") as "SENT" | "FAILED",
          providerRef: result?.messageId ?? null,
          errorMessage: ok ? null : (result?.status ?? "Unknown failure"),
          sentAt: ok ? new Date() : null,
        }
      })
      await prisma.smsLog.createMany({ data: logs })
      delivered += logs.filter((l) => l.status === "SENT").length
      failed += logs.filter((l) => l.status === "FAILED").length
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown SMS failure"
      console.error("[sms/bulk] chunk failed", errMsg)
      await prisma.smsLog.createMany({
        data: chunk.map((r) => ({
          schoolId,
          batchId: batch.id,
          recipientUserId: r.userId ?? null,
          phone: r.phone,
          message,
          status: "FAILED" as const,
          errorMessage: errMsg,
        })),
      })
      failed += chunk.length
    }
  }

  await prisma.smsBatch.update({
    where: { id: batch.id },
    data: {
      status: failed === 0 ? "COMPLETED" : delivered === 0 ? "FAILED" : "COMPLETED",
      deliveredCount: delivered,
      failedCount: failed,
      sentAt: new Date(),
    },
  })

  return {
    ok: delivered > 0,
    batchId: batch.id,
    totalCount: unique.length,
    deliveredCount: delivered,
    failedCount: failed,
  }
}

function dedupeByPhone(recipients: BulkRecipient[]): BulkRecipient[] {
  const seen = new Set<string>()
  const out: BulkRecipient[] = []
  for (const r of recipients) {
    if (!r.phone || seen.has(r.phone)) continue
    seen.add(r.phone)
    out.push(r)
  }
  return out
}

export type SmsAudience =
  | { type: "ALL_PARENTS" }
  | { type: "ALL_STAFF" }
  | { type: "CLASS_PARENTS"; classId: string }
  | { type: "CUSTOM"; phones: string[] }

/**
 * Resolve a structured audience into a list of phone numbers (plus userId
 * where available). Used by the bulk SMS API to translate a UI selection
 * into recipients before handing off to sendBulkSms.
 */
export async function resolveSmsAudience(
  schoolId: string,
  audience: SmsAudience,
): Promise<{ recipients: BulkRecipient[]; label: string }> {
  switch (audience.type) {
    case "ALL_PARENTS": {
      const rows = await prisma.user.findMany({
        where: { schoolId, role: "PARENT", isActive: true, deletedAt: null, phone: { not: null } },
        select: { id: true, phone: true },
      })
      return {
        recipients: rows.map((r) => ({ userId: r.id, phone: r.phone! })),
        label: "All parents",
      }
    }
    case "ALL_STAFF": {
      const rows = await prisma.user.findMany({
        where: {
          schoolId,
          role: { in: ["SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "BURSAR", "COUNSELOR", "LIBRARIAN", "HOSTEL_MASTER", "DRIVER"] },
          isActive: true,
          deletedAt: null,
          phone: { not: null },
        },
        select: { id: true, phone: true },
      })
      return {
        recipients: rows.map((r) => ({ userId: r.id, phone: r.phone! })),
        label: "All staff",
      }
    }
    case "CLASS_PARENTS": {
      const klass = await prisma.class.findFirst({
        where: { id: audience.classId, schoolId },
        select: { name: true },
      })
      const enrollments = await prisma.enrollment.findMany({
        where: { schoolId, classId: audience.classId, isActive: true, deletedAt: null },
        select: {
          student: {
            select: {
              parents: {
                select: {
                  parent: {
                    select: { userId: true, user: { select: { phone: true } } },
                  },
                },
              },
            },
          },
        },
      })
      const seen = new Set<string>()
      const recipients: BulkRecipient[] = []
      for (const e of enrollments) {
        for (const sp of e.student.parents) {
          const phone = sp.parent.user.phone
          if (!phone || seen.has(phone)) continue
          seen.add(phone)
          recipients.push({ userId: sp.parent.userId, phone })
        }
      }
      return { recipients, label: `Parents of ${klass?.name ?? "selected class"}` }
    }
    case "CUSTOM": {
      const recipients: BulkRecipient[] = audience.phones.map((p) => ({ phone: p.trim() }))
      return { recipients, label: `${recipients.length} custom number${recipients.length === 1 ? "" : "s"}` }
    }
  }
}
