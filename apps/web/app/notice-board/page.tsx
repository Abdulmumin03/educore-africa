import Link from "next/link"
import dayjs from "dayjs"
import { AlertTriangle, ExternalLink, Megaphone, Paperclip } from "lucide-react"
import { prisma } from "@/lib/db"
import { renderMarkdown } from "@/lib/markdown"

export const dynamic = "force-dynamic"
export const revalidate = 60

type SearchParams = Promise<{ school?: string }>

type AttachmentRecord = {
  url: string
  name: string
  size: number
  type: string
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  if (!params.school) return { title: "Notice board · EduCore Africa" }
  const school = await prisma.school.findUnique({
    where: { slug: params.school },
    select: { name: true },
  })
  return {
    title: school ? `${school.name} — Notice board` : "Notice board · EduCore Africa",
  }
}

export default async function NoticeBoardPage({ searchParams }: { searchParams: SearchParams }) {
  const { school: slug } = await searchParams

  if (!slug) {
    return (
      <Shell title="School notice board">
        <p className="text-sm text-muted-foreground">
          No school code supplied. Use a link like{" "}
          <code className="rounded bg-muted px-1 text-xs">/notice-board?school=your-slug</code>.
        </p>
      </Shell>
    )
  }

  const school = await prisma.school.findUnique({
    where: { slug },
    select: { id: true, name: true, motto: true, logoUrl: true },
  })

  if (!school) {
    return (
      <Shell title="Notice board">
        <p className="text-sm text-muted-foreground">School not found.</p>
      </Shell>
    )
  }

  const now = new Date()
  const announcements = await prisma.announcement.findMany({
    where: {
      schoolId: school.id,
      deletedAt: null,
      audience: { in: ["ALL", "PARENTS", "STUDENTS"] },
      AND: [
        { OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    },
    orderBy: [{ priority: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    take: 30,
    select: {
      id: true,
      title: true,
      body: true,
      priority: true,
      audience: true,
      publishedAt: true,
      createdAt: true,
      attachments: true,
    },
  })

  return (
    <Shell title={school.name} subtitle={school.motto}>
      {announcements.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No active notices at the moment. Check back soon.
        </p>
      ) : (
        <ul className="space-y-4">
          {announcements.map((a) => {
            const attachments = Array.isArray(a.attachments)
              ? (a.attachments as AttachmentRecord[])
              : []
            return (
              <li
                key={a.id}
                className={`rounded-md border bg-card p-4 shadow-sm ${
                  a.priority === "URGENT"
                    ? "border-red-500/40 bg-red-50/60"
                    : a.priority === "IMPORTANT"
                      ? "border-amber-500/40 bg-amber-50/60"
                      : ""
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {a.priority === "URGENT" && (
                    <span className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      <AlertTriangle className="h-3 w-3" />
                      URGENT
                    </span>
                  )}
                  {a.priority === "IMPORTANT" && (
                    <span className="rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      IMPORTANT
                    </span>
                  )}
                  <h2 className="text-base font-semibold">{a.title}</h2>
                </div>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  {dayjs(a.publishedAt ?? a.createdAt).format("D MMM YYYY · h:mm A")}
                </p>
                <div
                  className="prose prose-sm max-w-none text-sm"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body) }}
                />
                {attachments.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {attachments.map((f, i) => (
                      <li key={i}>
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1 rounded border bg-background px-2 py-1 text-xs hover:bg-muted"
                        >
                          <Paperclip className="h-3 w-3" />
                          {f.name}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Shell>
  )
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string | null
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Megaphone className="h-6 w-6 text-primary" />
            {title}
          </h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <Link href="/" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Powered by EduCore Africa
        </Link>
      </header>
      {children}
    </main>
  )
}
