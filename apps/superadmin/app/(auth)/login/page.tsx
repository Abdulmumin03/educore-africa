import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getConsoleUser } from "@/lib/session"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Sign in" }

const NOTICES: Record<string, string> = {
  idle: "You were signed out after 30 minutes of inactivity.",
  expired: "Your session reached its 8-hour limit. Sign in again.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { reason?: string }
}) {
  if (await getConsoleUser()) redirect("/console")

  const notice = searchParams.reason ? NOTICES[searchParams.reason] : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sign in</CardTitle>
        <CardDescription>Staff accounts only.</CardDescription>
      </CardHeader>
      <CardContent>
        {notice && (
          <p className="mb-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {notice}
          </p>
        )}
        <LoginForm />
      </CardContent>
    </Card>
  )
}
