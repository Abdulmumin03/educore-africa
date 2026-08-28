import { Prisma } from "@prisma/client"
import type { UserRole } from "@prisma/client"

import { prisma } from "@/lib/db"

// Cross-tenant user lookup.
//
// The school app scopes every query to one school. The console deliberately
// does not — support needs to find "the parent whose email is X" without
// first knowing which of 200 schools they belong to. Every read here is
// therefore school-agnostic, and every write is audited.

export type UserSearchRow = {
  id: string
  name: string
  email: string
  phone: string | null
  role: UserRole
  isActive: boolean
  schoolId: string | null
  school: string | null
  schoolSlug: string | null
  lastLoginAt: string | null
  createdAt: string
  activeSessions: number
}

export type UserSearchResult = {
  users: UserSearchRow[]
  total: number
  page: number
  pages: number
  /** True when the caller gave no filters — the list is then just "newest first". */
  unfiltered: boolean
}

export const USER_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "TEACHER",
  "BURSAR",
  "COUNSELOR",
  "STUDENT",
  "PARENT",
  "LIBRARIAN",
  "HOSTEL_MASTER",
  "DRIVER",
]

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as string[]).includes(value)
}

export async function searchUsers(options: {
  query?: string
  role?: UserRole
  schoolId?: string
  status?: "active" | "disabled" | "all"
  page?: number
  limit?: number
}): Promise<UserSearchResult> {
  const page = Math.max(1, options.page ?? 1)
  const limit = Math.min(100, Math.max(5, options.limit ?? 25))
  const query = options.query?.trim()

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(options.role ? { role: options.role } : {}),
    ...(options.schoolId ? { schoolId: options.schoolId } : {}),
    ...(options.status === "active"
      ? { isActive: true }
      : options.status === "disabled"
        ? { isActive: false }
        : {}),
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
          ],
        }
      : {}),
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ lastLoginAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        schoolId: true,
        lastLoginAt: true,
        createdAt: true,
        school: { select: { name: true, slug: true } },
        // Only sessions that have not lapsed — a stale row is not a login.
        _count: { select: { sessions: { where: { expires: { gt: new Date() } } } } },
      },
    }),
  ])

  return {
    users: users.map((user) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      schoolId: user.schoolId,
      school: user.school?.name ?? null,
      schoolSlug: user.school?.slug ?? null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      activeSessions: user._count.sessions,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    unfiltered: !query && !options.role && !options.schoolId && (options.status ?? "all") === "all",
  }
}

export async function getUserDetail(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      emailVerified: true,
      lastLoginAt: true,
      createdAt: true,
      schoolId: true,
      school: { select: { id: true, name: true, slug: true, state: true, isActive: true } },
      staff: { select: { staffNumber: true, staffType: true, department: true, status: true } },
      student: { select: { admissionNumber: true } },
      parent: { select: { id: true } },
      sessions: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expires: true },
      },
    },
  })
  if (!user) return null

  const now = new Date()
  return {
    id: user.id,
    name: `${user.firstName} ${user.lastName}`.trim(),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerified?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    school: user.school,
    profile: user.staff
      ? { kind: "staff" as const, ...user.staff }
      : user.student
        ? { kind: "student" as const, admissionNumber: user.student.admissionNumber }
        : user.parent
          ? { kind: "parent" as const }
          : null,
    sessions: user.sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      expires: session.expires.toISOString(),
      live: session.expires > now,
    })),
  }
}
