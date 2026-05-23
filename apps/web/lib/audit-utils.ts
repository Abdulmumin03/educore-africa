/**
 * Pure helpers used by the audit log. Lives in its own file so unit tests
 * can import without dragging Prisma or `next/headers` into the runner.
 */

export function auditDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Record<string, { old: unknown; new: unknown }> | null {
  if (!before && !after) return null
  if (!before) {
    const out: Record<string, { old: unknown; new: unknown }> = {}
    for (const [k, v] of Object.entries(after ?? {})) {
      out[k] = { old: null, new: v }
    }
    return Object.keys(out).length ? out : null
  }
  if (!after) {
    const out: Record<string, { old: unknown; new: unknown }> = {}
    for (const [k, v] of Object.entries(before)) {
      out[k] = { old: v, new: null }
    }
    return Object.keys(out).length ? out : null
  }
  const out: Record<string, { old: unknown; new: unknown }> = {}
  const keys = new Set<string>()
  for (const k of Object.keys(before)) keys.add(k)
  for (const k of Object.keys(after)) keys.add(k)
  for (const k of Array.from(keys)) {
    const a = before[k]
    const b = after[k]
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out[k] = { old: a ?? null, new: b ?? null }
    }
  }
  return Object.keys(out).length ? out : null
}

export function snapshot<T extends Record<string, unknown>>(
  record: T | null | undefined,
  fields: readonly (keyof T)[],
): Record<string, unknown> | null {
  if (!record) return null
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    out[f as string] = record[f]
  }
  return out
}
