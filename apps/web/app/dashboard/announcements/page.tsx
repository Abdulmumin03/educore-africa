import { redirect } from "next/navigation"
import type { UserRole } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { renderMarkdown } from "@/lib/markdown"
import { AnnouncementsManager } from "@/components/dashboard/announcements/announcements-manager"

export const metadata = { title: "Announcements · EduCore Africa" }

const VIEW_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
]

export default async function AnnouncementsPage() {
  const session = await auth()
  if (!session?.user || !session.user.schoolId) redirect("/dashboard")
  if (!VIEW_ROLES.includes(session.user.role)) redirect("/dashboard?forbidden=1")

  const [classes, announcements] = await Promise.all([
    prisma.class.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      orderBy: { level: "asc" },
      include: {
        sections: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
    prisma.announcement.findMany({
      where: { schoolId: session.user.schoolId, deletedAt: null },
      // URGENT first, then IMPORTANT, then NORMAL — within priority by recency.
      orderBy: [{ priority: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: {
        author: { select: { firstName: true, lastName: true, id: true } },
        class: { select: { name: true } },
        section: { select: { name: true } },
        _count: { select: { reads: true } },
      },
    }),
  ])

  const isPrivileged =
    session.user.role === "SUPER_ADMIN" ||
    session.user.role === "SCHOOL_ADMIN" ||
    session.user.role === "PRINCIPAL"

  return (
    <AnnouncementsManager
      currentUserId={session.user.id}
      isPrivileged={isPrivileged}
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        sections: c.sections,
      }))}
      items={announcements.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        bodyHtml: renderMarkdown(a.body),
        audience: a.audience,
        priority: a.priority,
        channels: a.channels,
        attachments: Array.isArray(a.attachments)
          ? (a.attachments as { url: string; name: string; size: number; type: string }[])
          : [],
        classId: a.classId,
        sectionId: a.sectionId,
        className: a.class?.name ?? null,
        sectionName: a.section?.name ?? null,
        publishedAt: a.publishedAt?.toISOString() ?? null,
        expiresAt: a.expiresAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
        authorId: a.author?.id ?? null,
        authorName: a.author
          ? `${a.author.firstName} ${a.author.lastName}`
          : null,
        readCount: a._count.reads,
      }))}
    />
  )
}
