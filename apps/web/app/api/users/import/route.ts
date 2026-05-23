import { NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { randomBytes } from "node:crypto"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { logAudit } from "@/lib/audit"

export const runtime = "nodejs"

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]

const ALLOWED_ROLES = new Set<UserRole>([
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "LIBRARIAN",
  "HOSTEL_MASTER",
  "DRIVER",
  "PARENT",
])

const bodySchema = z.object({
  csv: z.string().min(10).max(2 * 1024 * 1024),
})

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ",") {
        row.push(field)
        field = ""
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++
        row.push(field)
        field = ""
        if (row.length > 1 || row[0] !== "") rows.push(row)
        row = []
      } else field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

type Result =
  | { ok: true; row: number; email: string; tempPassword: string }
  | { ok: false; row: number; email: string; error: string }

/**
 * POST /api/users/import — bulk-add staff or parent accounts from CSV.
 *
 * Expected headers: email, firstName, lastName, role, phone (optional)
 * Allowed roles: TEACHER, BURSAR, COUNSELOR, LIBRARIAN, HOSTEL_MASTER,
 * DRIVER, PARENT. (Students use the P03 wizard, not this import.)
 *
 * Returns the temporary password per created row so the admin can share them
 * out-of-band. SCHOOL_ADMIN, PRINCIPAL — both with elevated power.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!ADMIN_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 422 })

  const rows = parseCsv(parsed.data.csv)
  if (rows.length < 2) {
    return NextResponse.json(
      { error: "CSV must have a header row plus at least one row" },
      { status: 422 },
    )
  }

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const idx = (k: string) => header.indexOf(k)
  for (const required of ["email", "firstname", "lastname", "role"]) {
    if (idx(required) < 0) {
      return NextResponse.json(
        { error: `Missing header "${required}"` },
        { status: 422 },
      )
    }
  }

  const schoolId = session.user.schoolId
  const results: Result[] = []
  let added = 0
  let skipped = 0
  let failed = 0

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    const get = (k: string) => {
      const i = idx(k)
      if (i < 0 || i >= cells.length) return ""
      return cells[i].trim()
    }
    const email = get("email").toLowerCase()
    const firstName = get("firstname")
    const lastName = get("lastname")
    const role = get("role").toUpperCase()
    const phone = get("phone") || null

    if (!email || !firstName || !lastName || !role) {
      results.push({ ok: false, row: r + 1, email: email || "(empty)", error: "Missing required field" })
      failed += 1
      continue
    }
    if (!ALLOWED_ROLES.has(role as UserRole)) {
      results.push({ ok: false, row: r + 1, email, error: `Role "${role}" not allowed` })
      failed += 1
      continue
    }
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      results.push({ ok: false, row: r + 1, email, error: "Already exists" })
      skipped += 1
      continue
    }

    const tempPassword = randomBytes(8).toString("base64url").slice(0, 12)
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    try {
      await prisma.user.create({
        data: {
          schoolId,
          email,
          firstName,
          lastName,
          phone,
          role: role as UserRole,
          passwordHash,
          isActive: true,
        },
      })
      added += 1
      results.push({ ok: true, row: r + 1, email, tempPassword })
    } catch (err) {
      failed += 1
      results.push({
        ok: false,
        row: r + 1,
        email,
        error: err instanceof Error ? err.message : "Insert failed",
      })
    }
  }

  await logAudit({
    schoolId,
    userId: session.user.id,
    action: "user.bulk-import",
    entityType: "User",
    metadata: { added, skipped, failed },
  })

  return NextResponse.json({ ok: true, added, skipped, failed, results })
}
