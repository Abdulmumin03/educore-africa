import Image from "next/image"
import { Suspense } from "react"
import { LoginForm } from "@/components/auth/login-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { prisma } from "@/lib/db"

export const metadata = { title: "Sign in · EduCore Africa" }

type Props = { searchParams: { school?: string; callbackUrl?: string } }

export default async function LoginPage({ searchParams }: Props) {
  const slug = searchParams.school
  const school = slug
    ? await prisma.school.findUnique({
        where: { slug },
        select: { name: true, logoUrl: true },
      })
    : null

  return (
    <Card>
      <CardHeader className="space-y-3">
        {school?.logoUrl ? (
          <Image
            src={school.logoUrl}
            alt={school.name}
            width={72}
            height={72}
            className="rounded-lg"
          />
        ) : null}
        <CardTitle className="text-2xl">
          {school ? `Welcome back to ${school.name}` : "Welcome back"}
        </CardTitle>
        <CardDescription>Sign in to your EduCore Africa account.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className="h-72 w-full" />}>
          <LoginForm callbackUrl={searchParams.callbackUrl} />
        </Suspense>
      </CardContent>
    </Card>
  )
}
