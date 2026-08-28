import { NextResponse } from "next/server"
import type { CrmNoteCategory } from "@prisma/client"

import { prisma } from "@/lib/db"
import { auditLog, auditTarget } from "@/lib/audit"
import { requireApiSession } from "@/lib/session-guard"

export const dynamic = "force-dynamic"

const CATEGORIES: CrmNoteCategory[] = ["SALES", "SUPPORT", "CALL", "ONBOARDING", "GENERAL"]

async function withAuthors(rows: Array<{ authorId: string } & Record<string, unknown>>) {
  const ids = [...new Set(rows.map((row) => row.authorId))]
  const authors = await prisma.superAdminUser.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, role: true },
  })
  const byId = new Map(authors.map((author) => [author.id, author]))
  return rows.map((row) => ({ ...row, author: byId.get(row.authorId) ?? null }))
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  const notes = await prisma.schoolCrmNote.findMany({
    where: { schoolId: params.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, authorId: true, category: true, body: true, createdAt: true },
  })

  return NextResponse.json({ notes: await withAuthors(notes) })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiSession(request)
  if (!guard.ok) return guard.response

  let body: { body?: unknown; category?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 })
  }

  const text = typeof body.body === "string" ? body.body.trim() : ""
  const category =
    typeof body.category === "string" && CATEGORIES.includes(body.category as CrmNoteCategory)
      ? (body.category as CrmNoteCategory)
      : "GENERAL"

  if (!text) return NextResponse.json({ error: "A note cannot be empty." }, { status: 400 })
  if (text.length > 4000) {
    return NextResponse.json({ error: "Notes are limited to 4000 characters." }, { status: 400 })
  }

  const note = await prisma.schoolCrmNote.create({
    data: { schoolId: params.id, authorId: guard.user.id, category, body: text },
    select: { id: true, authorId: true, category: true, body: true, createdAt: true },
  })

  await auditLog({
    userId: guard.user.id,
    action: "school.note.create",
    target: auditTarget("school", params.id),
    targetType: "school",
    ipAddress: guard.ipAddress,
    details: { category, length: text.length },
  })

  const [withAuthor] = await withAuthors([note])
  return NextResponse.json({ note: withAuthor }, { status: 201 })
}
