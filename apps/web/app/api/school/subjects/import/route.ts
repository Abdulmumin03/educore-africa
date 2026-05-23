import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { requireSchoolAdmin } from "@/lib/guard"

export const runtime = "nodejs"

const rowSchema = z.object({
  name: z.string().min(2).max(80),
  code: z.string().min(2).max(15),
  category: z.enum(["CORE", "ELECTIVE", "TRADE"]),
  creditUnits: z.number().int().min(1).max(10),
  isActive: z.boolean(),
})

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(",").map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cells = splitCsvRow(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()))
    return row
  })
}

function splitCsvRow(line: string): string[] {
  const out: string[] = []
  let buf = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuotes = !inQuotes
    else if (c === "," && !inQuotes) {
      out.push(buf)
      buf = ""
    } else buf += c
  }
  out.push(buf)
  return out
}

export async function POST(req: Request) {
  const g = await requireSchoolAdmin()
  if (!g.ok) return g.response

  const text = await req.text()
  if (!text.trim()) return NextResponse.json({ error: "Empty CSV" }, { status: 400 })

  const rows = parseCsv(text)
  if (rows.length === 0) {
    return NextResponse.json({ error: "No data rows found" }, { status: 400 })
  }

  let imported = 0
  let skipped = 0

  for (const raw of rows) {
    const parsed = rowSchema.safeParse({
      name: raw.name,
      code: raw.code,
      category: raw.category?.toUpperCase(),
      creditUnits: Number(raw.creditUnits || 1),
      isActive: String(raw.isActive ?? "true").toLowerCase() !== "false",
    })
    if (!parsed.success) {
      skipped++
      continue
    }
    try {
      await prisma.subject.create({
        data: {
          schoolId: g.session.user.schoolId,
          ...parsed.data,
          isCore: parsed.data.category === "CORE",
        },
      })
      imported++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ ok: true, imported, skipped })
}
