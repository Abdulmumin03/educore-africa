import type { MessageTemplateKind } from "@prisma/client"

import { prisma } from "@/lib/db"

// System message templates.
//
// The console owns the wording; apps/web owns the sending. Editing a template
// here changes what goes out next time the school app looks it up — it does
// NOT resend anything, and the editor says so.

/** One SMS segment. Anything longer is billed as multiple messages. */
export const SMS_SEGMENT_CHARS = 160
/** Concatenated SMS lose 7 characters per segment to the UDH header. */
export const SMS_MULTIPART_CHARS = 153

export const MERGE_TAGS = [
  { tag: "school_name", description: "The school's registered name" },
  { tag: "admin_name", description: "First name of the school administrator" },
  { tag: "plan_name", description: "Their subscription plan" },
  { tag: "amount", description: "Amount due, formatted in naira" },
  { tag: "due_date", description: "Due date, DD/MM/YYYY" },
  { tag: "invoice_number", description: "Invoice reference" },
  { tag: "login_url", description: "Direct link to their dashboard" },
  { tag: "support_email", description: "EduCore support address" },
] as const

export type MergeTag = (typeof MERGE_TAGS)[number]["tag"]

/** Realistic stand-ins for the preview. Never used for a real send. */
export const SAMPLE_VALUES: Record<MergeTag, string> = {
  school_name: "Greenfield International School",
  admin_name: "Ada",
  plan_name: "Professional",
  amount: "₦700,000",
  due_date: "15/09/2026",
  invoice_number: "INV-2026-00841",
  login_url: "https://app.educore.africa/auth/login?school=greenfield",
  support_email: "support@educore.africa",
}

/**
 * Substitute {{tags}}.
 *
 * An unknown tag is left exactly as written rather than blanked: a message
 * that goes out reading "Dear {{admin_nam}}" is obviously broken, whereas one
 * reading "Dear ," looks deliberate and reaches the recipient unnoticed.
 */
export function renderTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (whole, tag: string) =>
    Object.prototype.hasOwnProperty.call(values, tag) ? values[tag] : whole,
  )
}

/** Tags used in the body that are not on the allow-list. */
export function unknownTags(body: string): string[] {
  const known = new Set<string>(MERGE_TAGS.map((entry) => entry.tag))
  const used = [...body.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((match) => match[1])
  return [...new Set(used.filter((tag) => !known.has(tag)))]
}

export function smsSegments(body: string): { chars: number; segments: number } {
  const chars = body.length
  if (chars === 0) return { chars: 0, segments: 0 }
  if (chars <= SMS_SEGMENT_CHARS) return { chars, segments: 1 }
  return { chars, segments: Math.ceil(chars / SMS_MULTIPART_CHARS) }
}

export async function listTemplates(kind: MessageTemplateKind) {
  const templates = await prisma.messageTemplate.findMany({
    where: { kind },
    orderBy: { label: "asc" },
    select: {
      id: true,
      key: true,
      label: true,
      description: true,
      subject: true,
      body: true,
      mergeTags: true,
      isActive: true,
      updatedAt: true,
      updatedById: true,
      versions: {
        orderBy: { version: "desc" },
        take: 5,
        select: { id: true, version: true, subject: true, body: true, createdAt: true, editedById: true },
      },
    },
  })

  const editorIds = [
    ...new Set(
      [
        ...templates.map((template) => template.updatedById),
        ...templates.flatMap((template) => template.versions.map((version) => version.editedById)),
      ].filter((id): id is string => Boolean(id)),
    ),
  ]
  const editors = await prisma.superAdminUser.findMany({
    where: { id: { in: editorIds } },
    select: { id: true, name: true },
  })
  const names = new Map(editors.map((editor) => [editor.id, editor.name]))

  return templates.map((template) => ({
    ...template,
    updatedAt: template.updatedAt.toISOString(),
    updatedBy: template.updatedById ? (names.get(template.updatedById) ?? "Unknown") : null,
    unknownTags: unknownTags(template.body),
    ...(kind === "SMS" ? smsSegments(template.body) : {}),
    versions: template.versions.map((version) => ({
      id: version.id,
      version: version.version,
      subject: version.subject,
      body: version.body,
      createdAt: version.createdAt.toISOString(),
      editedBy: version.editedById ? (names.get(version.editedById) ?? "Unknown") : null,
    })),
  }))
}

/**
 * Save an edit, snapshotting what was there first.
 *
 * The version row records the OUTGOING wording, not the incoming one, so
 * "roll back to version 3" restores what version 3 actually said.
 */
export async function saveTemplate(input: {
  id: string
  subject?: string | null
  body: string
  editedById: string
}): Promise<{ version: number } | null> {
  const existing = await prisma.messageTemplate.findUnique({
    where: { id: input.id },
    select: { id: true, kind: true, subject: true, body: true },
  })
  if (!existing) return null

  const latest = await prisma.messageTemplateVersion.findFirst({
    where: { templateId: existing.id },
    orderBy: { version: "desc" },
    select: { version: true },
  })
  const nextVersion = (latest?.version ?? 0) + 1

  await prisma.$transaction([
    prisma.messageTemplateVersion.create({
      data: {
        templateId: existing.id,
        version: nextVersion,
        subject: existing.subject,
        body: existing.body,
        editedById: input.editedById,
      },
    }),
    prisma.messageTemplate.update({
      where: { id: existing.id },
      data: {
        ...(existing.kind === "EMAIL" ? { subject: input.subject ?? existing.subject } : {}),
        body: input.body,
        updatedById: input.editedById,
      },
    }),
  ])

  return { version: nextVersion }
}
