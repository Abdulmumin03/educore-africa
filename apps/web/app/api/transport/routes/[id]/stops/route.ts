import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { TRANSPORT_WRITE_ROLES } from "@/lib/transport-helpers"

export const runtime = "nodejs"

const stopSchema = z.object({
  id: z.string().cuid().optional(),
  sequence: z.number().int().min(1).max(50),
  name: z.string().trim().min(2).max(80),
  address: z.string().max(200).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
})

const bodySchema = z.object({
  stops: z.array(stopSchema).min(1).max(40),
  replace: z.boolean().default(true),
})

/**
 * POST /api/transport/routes/[id]/stops
 *
 * Bulk replace (or upsert) the stop list for a route. With `replace: true`
 * (default) all prior stops are soft-deleted before the new set is inserted.
 * Sequence numbers must be unique within the payload; the unique constraint
 * (routeId, sequence) enforces this at the DB too.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.schoolId)
    return NextResponse.json({ error: "No school context" }, { status: 400 })
  if (!TRANSPORT_WRITE_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const route = await prisma.busRoute.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!route) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    )
  }
  const { stops, replace } = parsed.data

  const seqs = stops.map((s) => s.sequence)
  if (new Set(seqs).size !== seqs.length) {
    return NextResponse.json({ error: "Sequence numbers must be unique." }, { status: 422 })
  }

  // Replace strategy: soft-delete existing then insert the new set. This is
  // simpler than diff/merge and matches how the AI timetable save works.
  await prisma.$transaction(async (tx) => {
    if (replace) {
      await tx.routeStop.updateMany({
        where: { routeId: route.id, deletedAt: null },
        data: { deletedAt: new Date() },
      })
    }
    for (const s of stops) {
      await tx.routeStop.create({
        data: {
          routeId: route.id,
          sequence: s.sequence,
          name: s.name,
          address: s.address ?? null,
          latitude: s.latitude ?? null,
          longitude: s.longitude ?? null,
          scheduledTime: s.scheduledTime,
        },
      })
    }
  })

  return NextResponse.json({ ok: true, saved: stops.length })
}
