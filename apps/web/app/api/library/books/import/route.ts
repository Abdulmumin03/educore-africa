import { NextResponse } from "next/server"
import { z } from "zod"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getDefaultLibrary } from "@/lib/library-helpers"

export const runtime = "nodejs"

const WRITE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "LIBRARIAN",
]

const bodySchema = z.object({
  csv: z.string().min(10).max(2 * 1024 * 1024),
})

/**
 * Minimal CSV parser — handles quoted fields with embedded commas and
 * escaped double-quotes. Good enough for our small import surface; if we ever
 * need full RFC-4180 plus newlines-in-fields, swap in papaparse.
 */
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
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ",") {
        row.push(field)
        field = ""
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++
        row.push(field)
        field = ""
        if (row.length > 1 || row[0] !== "") rows.push(row)
        row = []
      } else {
        field += c
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

type RowResult =
  | { ok: true; id: string; title: string }
  | { ok: false; row: number; title: string; error: string }

/**
 * POST /api/library/books/import — CSV bulk import.
 *
 * Expected headers: title, author, isbn, category, publisher, year, description, totalCopies
 * Rows missing a title are reported as errors; rows whose ISBN already exists
 * in the library are reported as `skipped`.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 422 })

  const rows = parseCsv(parsed.data.csv)
  if (rows.length < 2) {
    return NextResponse.json({ error: "CSV must have a header row plus at least one row" }, { status: 422 })
  }

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const idx = (name: string) => header.indexOf(name)
  const titleIdx = idx("title")
  if (titleIdx < 0) {
    return NextResponse.json({ error: "Header must contain 'title'" }, { status: 422 })
  }

  const lib = await getDefaultLibrary(session.user.schoolId)

  const results: RowResult[] = []
  let added = 0
  let skipped = 0

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    const get = (name: string) => {
      const i = idx(name)
      if (i < 0 || i >= cells.length) return ""
      return cells[i].trim()
    }

    const title = get("title")
    if (!title) {
      results.push({ ok: false, row: r + 1, title: "(empty)", error: "Missing title" })
      continue
    }

    const isbn = get("isbn") || null
    const totalRaw = get("totalcopies")
    const totalCopies = totalRaw ? Math.max(1, Math.min(10000, Number(totalRaw) || 1)) : 1
    const yearRaw = get("year")
    const year = yearRaw ? Number(yearRaw) || null : null

    try {
      const created = await prisma.libraryBook.create({
        data: {
          libraryId: lib.id,
          title,
          author: get("author") || null,
          isbn,
          category: get("category") || null,
          publisher: get("publisher") || null,
          year: year && year >= 1500 && year <= new Date().getFullYear() + 1 ? year : null,
          description: get("description") || null,
          totalCopies,
          availableCopies: totalCopies,
        },
        select: { id: true },
      })
      added += 1
      results.push({ ok: true, id: created.id, title })
    } catch (err) {
      if (err instanceof Error && /Unique constraint/i.test(err.message)) {
        skipped += 1
        results.push({ ok: false, row: r + 1, title, error: "Duplicate ISBN" })
      } else {
        results.push({
          ok: false,
          row: r + 1,
          title,
          error: err instanceof Error ? err.message : "Insert failed",
        })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    added,
    skipped,
    failed: results.filter((r) => !r.ok && r.error !== "Duplicate ISBN").length,
    results,
  })
}
