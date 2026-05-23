import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { MessagesClient } from "@/components/dashboard/messages/messages-client"

export const metadata = { title: "Messages · EduCore Africa" }

export default async function MessagesPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")

  return (
    <MessagesClient
      currentUserId={session.user.id}
      aiConfigured={!!process.env.ANTHROPIC_API_KEY}
    />
  )
}
