import { z } from "zod"
import type { ReportTemplateKind } from "@prisma/client"
import { prisma } from "@/lib/db"

/**
 * Structured config that drives the React-PDF render. Schools customise
 * colours, which sections appear (and in what order), signature lines, and
 * a few custom text strings. The defaults below mirror today's hardcoded
 * visual exactly so untemplated schools see no change.
 */
export type ReportTemplateConfig = {
  header: {
    layout: "centered" | "left-logo" | "right-logo"
    showLogo: boolean
    showMotto: boolean
    showSlogan: boolean
    titleOverride?: string
  }
  colors: {
    primary: string // hex #RRGGBB — school name + section titles
    accent: string // table header background
    headerBorder: string
    totalsBorder: string
    positive: string // pass-grade highlight (e.g. credits on WAEC mock)
    negative: string // fail-grade highlight
    watermark?: string // midterm only
    bodyText: string
    mutedText: string
  }
  sections: GradeSection[] | MidtermSection[]
  signatures: Array<{ label: string }>
  customText: {
    footer?: string
    watermark?: string
    nextTermPrefix?: string
  }
}

export type GradeSection =
  | "student-info"
  | "subjects-table"
  | "totals"
  | "class-teacher-comment"
  | "principal-comment"
  | "signatures"
  | "next-term-banner"

export type MidtermSection =
  | "student-info"
  | "subjects-table"
  | "totals"
  | "class-teacher-comment"
  | "principal-comment"
  | "signatures"

// ─────────────────────────────────────────────────────────────────────────
// Validation (used by the future CRUD API in PR2)
// ─────────────────────────────────────────────────────────────────────────

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use #RRGGBB hex")

const headerSchema = z.object({
  layout: z.enum(["centered", "left-logo", "right-logo"]),
  showLogo: z.boolean(),
  showMotto: z.boolean(),
  showSlogan: z.boolean(),
  titleOverride: z.string().trim().max(80).optional(),
})

const colorsSchema = z.object({
  primary: hex,
  accent: hex,
  headerBorder: hex,
  totalsBorder: hex,
  positive: hex,
  negative: hex,
  watermark: hex.optional(),
  bodyText: hex,
  mutedText: hex,
})

const customTextSchema = z.object({
  footer: z.string().trim().max(120).optional(),
  watermark: z.string().trim().max(40).optional(),
  nextTermPrefix: z.string().trim().max(60).optional(),
})

const signatureSchema = z.object({
  label: z.string().trim().min(1).max(60),
})

const gradeSectionEnum = z.enum([
  "student-info",
  "subjects-table",
  "totals",
  "class-teacher-comment",
  "principal-comment",
  "signatures",
  "next-term-banner",
])

const midtermSectionEnum = z.enum([
  "student-info",
  "subjects-table",
  "totals",
  "class-teacher-comment",
  "principal-comment",
  "signatures",
])

export const gradeTemplateConfigSchema = z.object({
  header: headerSchema,
  colors: colorsSchema,
  sections: z.array(gradeSectionEnum).min(1).max(20),
  signatures: z.array(signatureSchema).max(6),
  customText: customTextSchema,
})

export const midtermTemplateConfigSchema = z.object({
  header: headerSchema,
  colors: colorsSchema,
  sections: z.array(midtermSectionEnum).min(1).max(20),
  signatures: z.array(signatureSchema).max(6),
  customText: customTextSchema,
})

// ─────────────────────────────────────────────────────────────────────────
// Builtin defaults — must mirror the current hardcoded visuals so PR1 is
// behaviour-preserving for every existing school.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_COLORS = {
  primary: "#0D2B5E",
  accent: "#f1f5f9",
  headerBorder: "#cbd5e1",
  totalsBorder: "#cbd5e1",
  positive: "#0f766e",
  negative: "#b91c1c",
  bodyText: "#0f172a",
  mutedText: "#475569",
} as const

export const DEFAULT_GRADE_TEMPLATE: ReportTemplateConfig = {
  header: {
    layout: "left-logo",
    showLogo: true,
    showMotto: true,
    showSlogan: false,
  },
  colors: { ...DEFAULT_COLORS },
  sections: [
    "student-info",
    "subjects-table",
    "totals",
    "class-teacher-comment",
    "principal-comment",
    "signatures",
    "next-term-banner",
  ],
  signatures: [
    { label: "Class teacher signature" },
    { label: "Principal signature & school stamp" },
  ],
  customText: {
    nextTermPrefix: "Next term begins",
  },
}

export const DEFAULT_MIDTERM_TEMPLATE: ReportTemplateConfig = {
  header: {
    layout: "left-logo",
    showLogo: true,
    showMotto: true,
    showSlogan: false,
    titleOverride: "Midterm report — not final",
  },
  colors: {
    ...DEFAULT_COLORS,
    primary: "#92400e", // warm amber for midterm titles
    accent: "#f1f5f9",
    watermark: "#fee2c2",
  },
  sections: [
    "student-info",
    "subjects-table",
    "totals",
    "class-teacher-comment",
    "principal-comment",
    "signatures",
  ],
  signatures: [{ label: "Class teacher" }, { label: "Principal" }],
  customText: {
    watermark: "MIDTERM",
  },
}

export function defaultFor(kind: ReportTemplateKind): ReportTemplateConfig {
  return kind === "GRADE" ? DEFAULT_GRADE_TEMPLATE : DEFAULT_MIDTERM_TEMPLATE
}

// ─────────────────────────────────────────────────────────────────────────
// Resolver
// ─────────────────────────────────────────────────────────────────────────

/**
 * Returns the active ReportTemplateConfig for the given school + kind, with
 * optional curriculum scoping. Order:
 *   1. curriculum-specific isDefault row for that kind (PR3 wires the UI)
 *   2. kind-wide isDefault row (curriculumId = null)
 *   3. builtin default constant
 *
 * Always returns a config — never null. Bad JSON in the DB falls through to
 * the builtin so render paths can't 500 on a malformed template.
 */
export async function resolveTemplate(
  schoolId: string,
  kind: ReportTemplateKind,
  curriculumId: string | null = null,
): Promise<ReportTemplateConfig> {
  const candidates = await prisma.reportTemplate.findMany({
    where: {
      schoolId,
      kind,
      deletedAt: null,
      isDefault: true,
      OR: curriculumId
        ? [{ curriculumId }, { curriculumId: null }]
        : [{ curriculumId: null }],
    },
    orderBy: [{ curriculumId: "desc" }], // non-null (curriculum-specific) sorts before null
  })

  for (const row of candidates) {
    const schema = kind === "GRADE" ? gradeTemplateConfigSchema : midtermTemplateConfigSchema
    const parsed = schema.safeParse(row.config)
    if (parsed.success) return parsed.data as ReportTemplateConfig
  }
  return defaultFor(kind)
}
