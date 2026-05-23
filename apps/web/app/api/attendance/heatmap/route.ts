import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { resolveAttendanceAccess } from "@/lib/attendance-access"
import { dayOnly } from "@/lib/attendance-schemas"

export const runtime = "nodejs"

const MAX_KEYS = 30
const MAX_DAYS = 90

type Agg = { present: number; late: number; absent: number; excused: number }
const emptyAgg = (): Agg => ({ present: 0, late: 0, absent: 0, excused: 0 })

function add(into: Agg, status: string, n: number) {
  if (status === "PRESENT") into.present += n
  else if (status === "LATE") into.late += n
  else if (status === "ABSENT") into.absent += n
  else if (status === "EXCUSED") into.excused += n
}

function toPct(a: Agg): { total: number; pct: number | null } {
  const total = a.present + a.late + a.absent + a.excused
  if (total === 0) return { total: 0, pct: null }
  return { total, pct: Math.round(((a.present + a.late * 0.5) / total) * 100) }
}

/**
 * Daily attendance percentages over a date range, keyed by either section
 * (`sectionIds=`) or class (`classIds=`). Class mode aggregates every section
 * under that class. Used by the monthly heatmap.
 */
export async function GET(req: Request) {
  const access = await resolveAttendanceAccess()
  if (!access.ok) return access.response

  const url = new URL(req.url)
  const sectionIdsParam = url.searchParams.get("sectionIds")
  const classIdsParam = url.searchParams.get("classIds")
  const fromStr = url.searchParams.get("from")
  const toStr = url.searchParams.get("to")
  if (!sectionIdsParam && !classIdsParam) {
    return NextResponse.json({ error: "sectionIds or classIds required" }, { status: 422 })
  }

  const to = toStr ? dayOnly(toStr) : dayOnly(new Date())
  const from = fromStr ? dayOnly(fromStr) : dayOnly(new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000))
  if ((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24) > MAX_DAYS) {
    return NextResponse.json({ error: "date range too wide" }, { status: 422 })
  }

  // Resolve the per-section query universe and the section→key map.
  let where: Prisma.AttendanceWhereInput
  const sectionToKey = new Map<string, string>()
  const keys: string[] = []

  if (classIdsParam) {
    const classIds = classIdsParam.split(",").slice(0, MAX_KEYS)
    keys.push(...classIds)
    const sections = await prisma.section.findMany({
      where: {
        schoolId: access.session.schoolId,
        deletedAt: null,
        classId: { in: classIds },
      },
      select: { id: true, classId: true },
    })
    sections.forEach((s) => sectionToKey.set(s.id, s.classId))
    if (sectionToKey.size === 0) {
      const empty = Object.fromEntries(classIds.map((k) => [k, []])) as Record<
        string,
        Array<{ date: string; pct: number | null; total: number }>
      >
      return NextResponse.json({
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        keys: classIds,
        series: empty,
        sections: empty,
      })
    }
    where = {
      schoolId: access.session.schoolId,
      deletedAt: null,
      sectionId: { in: Array.from(sectionToKey.keys()) },
      date: { gte: from, lte: to },
    }
  } else {
    const sectionIds = sectionIdsParam!.split(",").slice(0, MAX_KEYS)
    keys.push(...sectionIds)
    sectionIds.forEach((s) => sectionToKey.set(s, s))
    where = {
      schoolId: access.session.schoolId,
      deletedAt: null,
      sectionId: { in: sectionIds },
      date: { gte: from, lte: to },
    }
  }

  const rows = await prisma.attendance.groupBy({
    by: ["sectionId", "date", "status"],
    where,
    _count: { _all: true },
  })

  // Aggregate into { key: { dateISO: Agg } }
  const byKeyDate = new Map<string, Map<string, Agg>>()
  for (const r of rows) {
    const key = sectionToKey.get(r.sectionId)
    if (!key) continue
    const dateKey = r.date.toISOString().slice(0, 10)
    if (!byKeyDate.has(key)) byKeyDate.set(key, new Map())
    const dayMap = byKeyDate.get(key)!
    const a = dayMap.get(dateKey) ?? emptyAgg()
    add(a, r.status, r._count._all)
    dayMap.set(dateKey, a)
  }

  const series: Record<string, Array<{ date: string; pct: number | null; total: number }>> = {}
  keys.forEach((k) => {
    const dayMap = byKeyDate.get(k)
    series[k] = []
    const cursor = new Date(from)
    while (cursor.getTime() <= to.getTime()) {
      const dateKey = cursor.toISOString().slice(0, 10)
      const a = dayMap?.get(dateKey)
      series[k].push({ date: dateKey, ...toPct(a ?? emptyAgg()) })
      cursor.setDate(cursor.getDate() + 1)
    }
  })

  return NextResponse.json({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    keys,
    series,
    // Backwards-compat alias for the existing client.
    sections: series,
  })
}
