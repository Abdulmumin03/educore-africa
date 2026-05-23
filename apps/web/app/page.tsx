import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="container mx-auto flex flex-col items-center justify-center gap-6 py-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-6xl">EduCore Africa</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          AI-powered, multi-tenant school management for the Nigerian and pan-African education
          market. Attendance, results, fees, hostels, library, transport &mdash; in one place.
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </div>
      </section>

      <section className="container mx-auto grid gap-4 px-4 pb-24 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Multi-tenant by design</CardTitle>
            <CardDescription>Every school is isolated at the row level.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Schools, users, students, fees &mdash; all scoped by tenant.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>African-first payments</CardTitle>
            <CardDescription>Paystack, USSD, mobile money, bank transfer.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Reconcile online and offline rails into a single ledger.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Risk scoring with Claude</CardTitle>
            <CardDescription>Identify dropout risk early.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Powered by Anthropic&apos;s latest models.
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
