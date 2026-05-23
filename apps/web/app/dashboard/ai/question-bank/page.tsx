import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { QuestionBankClient } from "@/components/dashboard/ai/question-bank-client"

export const metadata = { title: "AI question bank · EduCore Africa" }

const ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL", "TEACHER"]

export default async function QuestionBankPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!ROLES.includes(session.user.role)) redirect("/dashboard/ai?forbidden=1")

  const subjects = await prisma.subject.findMany({
    where: { schoolId: session.user.schoolId, deletedAt: null, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  })

  return <QuestionBankClient subjects={subjects} />
}
