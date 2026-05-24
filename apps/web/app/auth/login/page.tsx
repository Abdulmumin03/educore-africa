import Image from "next/image"
import { Suspense } from "react"
import { LoginForm } from "@/components/auth/login-form"
import { AuthCard } from "@/components/auth/auth-card"
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
    <AuthCard
      eyebrow="Welcome back"
      title={school ? `Sign in to ${school.name}` : "Sign in to your school"}
      description="Enter your credentials to access your EduCore Africa dashboard."
    >
      {school?.logoUrl ? (
        <div className="-mt-4 mb-6 flex items-center gap-3 rounded-xl border border-navy/10 bg-cream-soft px-3 py-2.5">
          <Image
            src={school.logoUrl}
            alt={school.name}
            width={36}
            height={36}
            className="rounded-md"
          />
          <div className="text-sm">
            <div className="font-semibold text-navy">{school.name}</div>
            <div className="text-xs text-navy/55">Signing in to this school</div>
          </div>
        </div>
      ) : null}
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <LoginForm callbackUrl={searchParams.callbackUrl} />
      </Suspense>
    </AuthCard>
  )
}
