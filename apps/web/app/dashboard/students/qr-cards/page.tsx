import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { QrCardsClient } from "@/components/dashboard/students/qr-cards-client"

export const metadata = { title: "Student QR ID cards · EduCore Africa" }

const VIEW_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

export default async function QrCardsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard/students?forbidden=1")

  const [school, classes] = await Promise.all([
    prisma.school.findUnique({
      where: { id: session.user.schoolId },
      select: { name: true, logoUrl: true, motto: true },
    }),
    prisma.class.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { level: "asc" },
      include: {
        sections: { where: { deletedAt: null }, orderBy: { name: "asc" } },
      },
    }),
  ])

  return (
    <QrCardsClient
      school={{
        name: school?.name ?? "EduCore Africa",
        logoUrl: school?.logoUrl ?? null,
        motto: school?.motto ?? null,
      }}
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
      }))}
    />
  )
}
