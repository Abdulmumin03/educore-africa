import { redirect } from "next/navigation"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { SmsComposerClient } from "@/components/dashboard/communications/sms-composer-client"

export const metadata = { title: "Bulk SMS · EduCore Africa" }

const SEND_ROLES: UserRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "BURSAR"]

export default async function BulkSmsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!SEND_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  const classes = await prisma.class.findMany({
    where: { schoolId: session.user.schoolId, deletedAt: null },
    orderBy: { level: "asc" },
    select: { id: true, name: true },
  })

  return (
    <SmsComposerClient
      classes={classes}
      providerConfigured={
        !!process.env.AFRICASTALKING_API_KEY && !!process.env.AFRICASTALKING_USERNAME
      }
    />
  )
}
