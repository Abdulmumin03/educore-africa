import { Prisma } from "@prisma/client"
import type { ReportSource } from "@prisma/client"

import { prisma } from "@/lib/db"

// The report builder's query engine.
//
// Every column and every filter has to name a key from the catalogue below,
// which maps to a hand-written SQL fragment. NOTHING from the request reaches
// a query as SQL: a builder that interpolated user-supplied field names would
// be an injection hole with a UI on it, and "it's behind auth" is not an
// answer when the auth in question is a support login.
//
// Values are always parameterised, and the operator set is closed.

export type FieldType = "text" | "number" | "currency" | "date" | "enum" | "boolean"

export type FieldDef = {
  key: string
  label: string
  type: FieldType
  /** SQL expression. Written here, never composed from input. */
  sql: string
  /** For enum fields: the values the picker offers. */
  options?: string[]
  /** Excluded from the default column set but still selectable. */
  advanced?: boolean
}

export type SourceDef = {
  key: ReportSource
  label: string
  description: string
  /** FROM + JOINs. Fixed per source. */
  from: string
  /** Rows the source is scoped to regardless of filters. */
  baseWhere: string
  fields: FieldDef[]
  defaultFields: string[]
  defaultSort: string
}

const PLANS = ["STARTER", "GROWTH", "PROFESSIONAL", "ENTERPRISE", "GOVERNMENT"]
const SUB_STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CHURNED"]

// Monthly-equivalent is derived in SQL the same way lib/metrics derives it in
// TypeScript, so a report and a dashboard card never disagree.
const MRR_SQL = `CASE sub."cycle"
    WHEN 'MONTHLY' THEN sub."amount"
    WHEN 'TERMLY'  THEN sub."amount" / 3
    ELSE sub."amount" / 12 END`

export const SOURCES: SourceDef[] = [
  {
    key: "SCHOOLS",
    label: "Schools",
    description: "One row per tenant, with its subscription and roll.",
    from: `FROM "schools" s
      LEFT JOIN "school_subscriptions" sub ON sub."school_id" = s."id"`,
    baseWhere: `s."deleted_at" IS NULL`,
    defaultFields: ["name", "state", "plan", "status", "students", "mrr", "created_at"],
    defaultSort: "created_at",
    fields: [
      { key: "name", label: "School", type: "text", sql: `s."name"` },
      { key: "slug", label: "Slug", type: "text", sql: `s."slug"`, advanced: true },
      { key: "state", label: "State", type: "text", sql: `s."state"` },
      { key: "city", label: "City", type: "text", sql: `s."city"`, advanced: true },
      { key: "email", label: "School email", type: "text", sql: `s."email"` },
      { key: "phone", label: "Phone", type: "text", sql: `s."phone"`, advanced: true },
      { key: "plan", label: "Plan", type: "enum", sql: `sub."plan"::text`, options: PLANS },
      { key: "status", label: "Subscription status", type: "enum", sql: `sub."status"::text`, options: SUB_STATUSES },
      { key: "cycle", label: "Billing cycle", type: "enum", sql: `sub."cycle"::text`, options: ["MONTHLY", "TERMLY", "ANNUAL"], advanced: true },
      { key: "amount", label: "Amount per cycle", type: "currency", sql: `sub."amount"` },
      { key: "mrr", label: "MRR", type: "currency", sql: MRR_SQL },
      { key: "students", label: "Students", type: "number", sql: `(SELECT count(*) FROM "students" st WHERE st."school_id" = s."id" AND st."deleted_at" IS NULL)` },
      { key: "staff", label: "Staff", type: "number", sql: `(SELECT count(*) FROM "staff" sf WHERE sf."school_id" = s."id" AND sf."deleted_at" IS NULL)` },
      { key: "churn_score", label: "Churn score", type: "number", sql: `(SELECT c."score" FROM "churn_risk_scores" c WHERE c."school_id" = s."id" AND c."is_latest" LIMIT 1)` },
      { key: "churn_level", label: "Churn risk", type: "enum", sql: `(SELECT c."level"::text FROM "churn_risk_scores" c WHERE c."school_id" = s."id" AND c."is_latest" LIMIT 1)`, options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      { key: "last_login", label: "Last login", type: "date", sql: `(SELECT max(u."last_login_at") FROM "users" u WHERE u."school_id" = s."id")` },
      { key: "trial_ends_at", label: "Trial ends", type: "date", sql: `sub."trial_ends_at"`, advanced: true },
      { key: "created_at", label: "Signed up", type: "date", sql: `s."created_at"` },
    ],
  },
  {
    key: "REVENUE",
    label: "Revenue",
    description: "One row per subscription charge.",
    from: `FROM "subscription_transactions" t
      JOIN "schools" s ON s."id" = t."school_id"
      LEFT JOIN "school_subscriptions" sub ON sub."school_id" = s."id"`,
    baseWhere: `s."deleted_at" IS NULL`,
    defaultFields: ["school", "amount", "txn_status", "gateway", "paid_at"],
    defaultSort: "paid_at",
    fields: [
      { key: "school", label: "School", type: "text", sql: `s."name"` },
      { key: "state", label: "State", type: "text", sql: `s."state"` },
      { key: "plan", label: "Plan", type: "enum", sql: `sub."plan"::text`, options: PLANS },
      { key: "amount", label: "Amount", type: "currency", sql: `t."amount"` },
      { key: "txn_status", label: "Status", type: "enum", sql: `t."status"::text`, options: ["PENDING", "SUCCESSFUL", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"] },
      { key: "gateway", label: "Gateway", type: "enum", sql: `t."gateway"::text`, options: ["PAYSTACK", "FLUTTERWAVE", "REMITA", "BANK_TRANSFER", "CASH"] },
      { key: "reference", label: "Reference", type: "text", sql: `t."reference"`, advanced: true },
      { key: "failure_reason", label: "Failure reason", type: "text", sql: `t."failure_reason"` },
      { key: "attempts", label: "Attempts", type: "number", sql: `t."attempts"`, advanced: true },
      { key: "due_date", label: "Due", type: "date", sql: `t."due_date"` },
      { key: "paid_at", label: "Paid", type: "date", sql: `t."paid_at"` },
    ],
  },
  {
    key: "USERS",
    label: "Users",
    description: "Every account across every tenant.",
    from: `FROM "users" u
      LEFT JOIN "schools" s ON s."id" = u."school_id"`,
    baseWhere: `u."deleted_at" IS NULL`,
    defaultFields: ["name", "email", "role", "school", "is_active", "last_login"],
    defaultSort: "last_login",
    fields: [
      { key: "name", label: "Name", type: "text", sql: `(u."first_name" || ' ' || u."last_name")` },
      { key: "email", label: "Email", type: "text", sql: `u."email"` },
      { key: "phone", label: "Phone", type: "text", sql: `u."phone"`, advanced: true },
      { key: "role", label: "Role", type: "enum", sql: `u."role"::text`, options: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER", "BURSAR", "COUNSELOR", "STUDENT", "PARENT", "LIBRARIAN", "HOSTEL_MASTER", "DRIVER"] },
      { key: "school", label: "School", type: "text", sql: `s."name"` },
      { key: "state", label: "State", type: "text", sql: `s."state"` },
      { key: "is_active", label: "Active", type: "boolean", sql: `u."is_active"` },
      { key: "last_login", label: "Last login", type: "date", sql: `u."last_login_at"` },
      { key: "created_at", label: "Created", type: "date", sql: `u."created_at"` },
    ],
  },
  {
    key: "TICKETS",
    label: "Support tickets",
    description: "One row per ticket, with its SLA timestamps.",
    from: `FROM "support_tickets" t
      JOIN "schools" s ON s."id" = t."school_id"`,
    baseWhere: `s."deleted_at" IS NULL`,
    defaultFields: ["title", "school", "category", "priority", "ticket_status", "created_at"],
    defaultSort: "created_at",
    fields: [
      { key: "title", label: "Title", type: "text", sql: `t."title"` },
      { key: "school", label: "School", type: "text", sql: `s."name"` },
      { key: "state", label: "State", type: "text", sql: `s."state"` },
      { key: "category", label: "Category", type: "enum", sql: `t."category"::text`, options: ["BILLING", "TECHNICAL", "FEATURE_REQUEST", "ACCOUNT", "OTHER"] },
      { key: "priority", label: "Priority", type: "enum", sql: `t."priority"::text`, options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
      { key: "ticket_status", label: "Status", type: "enum", sql: `t."status"::text`, options: ["OPEN", "IN_PROGRESS", "WAITING_ON_CLIENT", "RESOLVED", "CLOSED"] },
      { key: "comments", label: "Messages", type: "number", sql: `(SELECT count(*) FROM "ticket_comments" c WHERE c."ticket_id" = t."id")` },
      { key: "response_hours", label: "Hours to first reply", type: "number", sql: `round(EXTRACT(EPOCH FROM (t."first_response_at" - t."created_at")) / 3600.0, 1)` },
      { key: "resolution_hours", label: "Hours to resolve", type: "number", sql: `round(EXTRACT(EPOCH FROM (t."resolved_at" - t."created_at")) / 3600.0, 1)` },
      { key: "created_at", label: "Opened", type: "date", sql: `t."created_at"` },
      { key: "resolved_at", label: "Resolved", type: "date", sql: `t."resolved_at"` },
    ],
  },
  {
    key: "USAGE",
    label: "Usage",
    description: "Monthly usage snapshots per school.",
    from: `FROM "school_usage_snapshots" us
      JOIN "schools" s ON s."id" = us."school_id"
      LEFT JOIN "school_subscriptions" sub ON sub."school_id" = s."id"`,
    baseWhere: `s."deleted_at" IS NULL`,
    defaultFields: ["school", "month", "logins", "sms_sent", "fees_processed"],
    defaultSort: "month",
    fields: [
      { key: "school", label: "School", type: "text", sql: `s."name"` },
      { key: "state", label: "State", type: "text", sql: `s."state"` },
      { key: "plan", label: "Plan", type: "enum", sql: `sub."plan"::text`, options: PLANS },
      { key: "month", label: "Month", type: "date", sql: `us."month"` },
      { key: "logins", label: "Logins", type: "number", sql: `us."logins"` },
      { key: "sms_sent", label: "SMS sent", type: "number", sql: `us."sms_sent"` },
      { key: "students_added", label: "Students added", type: "number", sql: `us."students_added"` },
      { key: "fees_processed", label: "Fees processed", type: "currency", sql: `us."fees_processed"` },
      { key: "storage_mb", label: "Storage MB", type: "number", sql: `us."storage_mb"`, advanced: true },
      { key: "api_calls", label: "API calls", type: "number", sql: `us."api_calls"`, advanced: true },
    ],
  },
  {
    key: "FEATURE_ADOPTION",
    label: "Feature adoption",
    description: "One row per school, with a yes/no per module.",
    from: `FROM "schools" s
      LEFT JOIN "school_subscriptions" sub ON sub."school_id" = s."id"`,
    baseWhere: `s."deleted_at" IS NULL`,
    defaultFields: ["school", "plan", "attendance", "grades", "finance", "modules_used"],
    defaultSort: "modules_used",
    fields: [
      { key: "school", label: "School", type: "text", sql: `s."name"` },
      { key: "state", label: "State", type: "text", sql: `s."state"` },
      { key: "plan", label: "Plan", type: "enum", sql: `sub."plan"::text`, options: PLANS },
      { key: "attendance", label: "Attendance", type: "boolean", sql: `EXISTS (SELECT 1 FROM "attendance" x WHERE x."school_id" = s."id")` },
      { key: "grades", label: "Grades", type: "boolean", sql: `EXISTS (SELECT 1 FROM "grades" x WHERE x."school_id" = s."id")` },
      { key: "finance", label: "Finance", type: "boolean", sql: `EXISTS (SELECT 1 FROM "fee_invoices" x WHERE x."school_id" = s."id")` },
      { key: "communication", label: "Communication", type: "boolean", sql: `EXISTS (SELECT 1 FROM "announcements" x WHERE x."school_id" = s."id")` },
      { key: "elearning", label: "E-Learning", type: "boolean", sql: `EXISTS (SELECT 1 FROM "assignments" x WHERE x."school_id" = s."id")` },
      { key: "library", label: "Library", type: "boolean", sql: `EXISTS (SELECT 1 FROM "libraries" x WHERE x."school_id" = s."id")` },
      { key: "transport", label: "Transport", type: "boolean", sql: `EXISTS (SELECT 1 FROM "bus_routes" x WHERE x."school_id" = s."id")` },
      { key: "hostel", label: "Hostel", type: "boolean", sql: `EXISTS (SELECT 1 FROM "hostels" x WHERE x."school_id" = s."id")` },
      {
        key: "modules_used",
        label: "Modules used",
        type: "number",
        sql: `(
          (CASE WHEN EXISTS (SELECT 1 FROM "attendance" x WHERE x."school_id" = s."id") THEN 1 ELSE 0 END) +
          (CASE WHEN EXISTS (SELECT 1 FROM "grades" x WHERE x."school_id" = s."id") THEN 1 ELSE 0 END) +
          (CASE WHEN EXISTS (SELECT 1 FROM "fee_invoices" x WHERE x."school_id" = s."id") THEN 1 ELSE 0 END) +
          (CASE WHEN EXISTS (SELECT 1 FROM "announcements" x WHERE x."school_id" = s."id") THEN 1 ELSE 0 END) +
          (CASE WHEN EXISTS (SELECT 1 FROM "assignments" x WHERE x."school_id" = s."id") THEN 1 ELSE 0 END) +
          (CASE WHEN EXISTS (SELECT 1 FROM "libraries" x WHERE x."school_id" = s."id") THEN 1 ELSE 0 END) +
          (CASE WHEN EXISTS (SELECT 1 FROM "bus_routes" x WHERE x."school_id" = s."id") THEN 1 ELSE 0 END) +
          (CASE WHEN EXISTS (SELECT 1 FROM "hostels" x WHERE x."school_id" = s."id") THEN 1 ELSE 0 END)
        )`,
      },
    ],
  },
]

export function getSource(key: string): SourceDef | null {
  return SOURCES.find((source) => source.key === key) ?? null
}

// ── Filters ──────────────────────────────────────────────────────────────────

export const OPERATORS = {
  text: ["contains", "eq", "neq", "is_null", "not_null"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "is_null", "not_null"],
  currency: ["eq", "neq", "gt", "gte", "lt", "lte"],
  date: ["after", "before", "last_n_days", "is_null", "not_null"],
  enum: ["eq", "neq", "in", "is_null", "not_null"],
  boolean: ["is_true", "is_false"],
} as const satisfies Record<FieldType, readonly string[]>

export type Filter = { field: string; operator: string; value?: unknown }

export const OPERATOR_LABEL: Record<string, string> = {
  contains: "contains",
  eq: "is",
  neq: "is not",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  after: "on or after",
  before: "before",
  last_n_days: "in the last N days",
  in: "is one of",
  is_null: "is empty",
  not_null: "is not empty",
  is_true: "is yes",
  is_false: "is no",
}

/**
 * Turn one validated filter into a parameterised SQL fragment.
 *
 * Returns null when the filter does not typecheck, and the caller REJECTS the
 * report rather than dropping it — a silently ignored filter produces a report
 * with more rows than asked for, which is the dangerous direction.
 */
function filterSql(field: FieldDef, filter: Filter): Prisma.Sql | null {
  const column = Prisma.raw(field.sql)
  const allowed = OPERATORS[field.type] as readonly string[]
  if (!allowed.includes(filter.operator)) return null

  switch (filter.operator) {
    case "is_null":
      return Prisma.sql`${column} IS NULL`
    case "not_null":
      return Prisma.sql`${column} IS NOT NULL`
    case "is_true":
      return Prisma.sql`${column} = true`
    case "is_false":
      return Prisma.sql`${column} = false`
  }

  if (filter.operator === "in") {
    const values = Array.isArray(filter.value)
      ? filter.value.filter((v): v is string => typeof v === "string")
      : []
    if (values.length === 0) return null
    // Enum options are a closed list, so an unknown value is a bad request.
    if (field.options && values.some((v) => !field.options?.includes(v))) return null
    return Prisma.sql`${column} = ANY(${values})`
  }

  if (filter.value === undefined || filter.value === null || filter.value === "") return null

  switch (field.type) {
    case "text":
      if (filter.operator === "contains") {
        return Prisma.sql`${column} ILIKE ${"%" + String(filter.value) + "%"}`
      }
      return filter.operator === "eq"
        ? Prisma.sql`${column} = ${String(filter.value)}`
        : Prisma.sql`${column} IS DISTINCT FROM ${String(filter.value)}`

    case "enum": {
      const value = String(filter.value)
      if (field.options && !field.options.includes(value)) return null
      return filter.operator === "eq"
        ? Prisma.sql`${column} = ${value}`
        : Prisma.sql`${column} IS DISTINCT FROM ${value}`
    }

    case "number":
    case "currency": {
      const value = Number(filter.value)
      if (!Number.isFinite(value)) return null
      switch (filter.operator) {
        case "eq":
          return Prisma.sql`${column} = ${value}`
        case "neq":
          return Prisma.sql`${column} IS DISTINCT FROM ${value}`
        case "gt":
          return Prisma.sql`${column} > ${value}`
        case "gte":
          return Prisma.sql`${column} >= ${value}`
        case "lt":
          return Prisma.sql`${column} < ${value}`
        case "lte":
          return Prisma.sql`${column} <= ${value}`
      }
      return null
    }

    case "date": {
      if (filter.operator === "last_n_days") {
        const days = Number(filter.value)
        if (!Number.isFinite(days) || days <= 0 || days > 3650) return null
        const since = new Date(Date.now() - days * 86_400_000)
        return Prisma.sql`${column} >= ${since}`
      }
      const date = new Date(String(filter.value))
      if (Number.isNaN(date.getTime())) return null
      return filter.operator === "after"
        ? Prisma.sql`${column} >= ${date}`
        : Prisma.sql`${column} < ${date}`
    }
  }

  return null
}

// ── Execution ────────────────────────────────────────────────────────────────

/** Nothing may ask for more than this, however the limit is set. */
export const MAX_ROWS = 20_000

export type ReportSpec = {
  source: string
  fields: string[]
  filters: Filter[]
  sortField?: string | null
  sortDir?: string
  limit?: number | null
}

export type ReportResult = {
  columns: Array<{ key: string; label: string; type: FieldType }>
  rows: Array<Record<string, unknown>>
  total: number
  truncated: boolean
  sql: string
  ms: number
}

export type ReportError = { error: string }

export async function runReport(
  spec: ReportSpec,
  options: { previewRows?: number } = {},
): Promise<ReportResult | ReportError> {
  const startedAt = Date.now()
  const source = getSource(spec.source)
  if (!source) return { error: "Unknown data source." }

  const byKey = new Map(source.fields.map((field) => [field.key, field]))

  const chosen = (spec.fields.length > 0 ? spec.fields : source.defaultFields)
    .map((key) => byKey.get(key))
    .filter((field): field is FieldDef => field !== undefined)
  if (chosen.length === 0) return { error: "Pick at least one field." }

  // Every filter must resolve. A filter that silently vanishes gives a wider
  // report than the operator asked for.
  const conditions: Prisma.Sql[] = []
  for (const filter of spec.filters) {
    const field = byKey.get(filter.field)
    if (!field) return { error: `Unknown filter field "${filter.field}".` }
    const fragment = filterSql(field, filter)
    if (!fragment) {
      return {
        error: `Filter on "${field.label}" is not valid — check the operator and value.`,
      }
    }
    conditions.push(fragment)
  }

  const where = Prisma.join(
    [Prisma.raw(source.baseWhere), ...conditions],
    " AND ",
  )

  const sortField = spec.sortField ? byKey.get(spec.sortField) : byKey.get(source.defaultSort)
  const direction = spec.sortDir === "asc" ? Prisma.raw("ASC") : Prisma.raw("DESC")
  const orderBy = sortField
    ? Prisma.sql`ORDER BY ${Prisma.raw(sortField.sql)} ${direction} NULLS LAST`
    : Prisma.empty

  const requested = options.previewRows ?? spec.limit ?? MAX_ROWS
  const limit = Math.min(MAX_ROWS, Math.max(1, requested))

  const select = Prisma.join(
    chosen.map((field) => Prisma.sql`${Prisma.raw(field.sql)} AS ${Prisma.raw(`"${field.key}"`)}`),
    ", ",
  )
  const from = Prisma.raw(source.from)

  try {
    const [rows, counted] = await Promise.all([
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT ${select} ${from} WHERE ${where} ${orderBy} LIMIT ${limit}
      `,
      prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n ${from} WHERE ${where}
      `,
    ])

    const total = Number(counted[0]?.n ?? 0)

    return {
      columns: chosen.map((field) => ({ key: field.key, label: field.label, type: field.type })),
      // Decimal and BigInt do not survive JSON, and a report that renders
      // "[object Object]" in the amount column is worse than no report.
      rows: rows.map((row) => {
        const out: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(row)) {
          out[key] =
            typeof value === "bigint"
              ? Number(value)
              : value instanceof Date
                ? value.toISOString()
                : value !== null && typeof value === "object" && "toNumber" in value
                  ? (value as { toNumber(): number }).toNumber()
                  : value
        }
        return out
      }),
      total,
      truncated: total > rows.length,
      sql: `${source.key} · ${chosen.length} fields · ${spec.filters.length} filters`,
      ms: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `The query failed: ${error.message.slice(0, 200)}`
          : "The query failed.",
    }
  }
}
