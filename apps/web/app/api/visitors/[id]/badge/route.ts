import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { renderVisitorBadgePdf } from "@/lib/visitor-badge-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STAFF_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "LIBRARIAN",
  "HOSTEL_MASTER",
]

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user) return new Response("Unauthorized", { status: 401 })
  if (!session.user.schoolId) return new Response("No school context", { status: 400 })
  if (!STAFF_ROLES.includes(session.user.role)) return new Response("Forbidden", { status: 403 })

  const v = await prisma.visitorLog.findFirst({
    where: { id: params.id, schoolId: session.user.schoolId, deletedAt: null },
    include: {
      host: {
        select: { firstName: true, lastName: true, role: true },
      },
      school: { select: { name: true, logoUrl: true } },
    },
  })
  if (!v) return new Response("Not found", { status: 404 })

  const pdf = await renderVisitorBadgePdf({
    id: v.id,
    visitorName: v.visitorName,
    visitorPhone: v.visitorPhone,
    purpose: v.purpose,
    host: v.host
      ? { name: `${v.host.firstName} ${v.host.lastName}`, role: v.host.role }
      : null,
    photoUrl: v.photoUrl,
    schoolName: v.school.name,
    schoolLogoUrl: v.school.logoUrl,
    checkedInAt: v.checkedInAt,
  })

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="visitor-badge-${v.id.slice(-8)}.pdf"`,
    },
  })
}
