import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/shared/page-header"
import { requireRole } from "@/lib/session"
import { isUserRole, searchUsers } from "@/lib/users"
import { cn, formatNumber } from "@/lib/utils"
import { USER_ROLE_LABEL } from "./roles"
import { UserActions } from "./user-actions"
import { UserSearch } from "./user-search"
import { UsersNav } from "./users-nav"

export const metadata: Metadata = { title: "School Users" }
export const dynamic = "force-dynamic"


export default async function UsersPage({
  searchParams,
}: {
  searchParams: { q?: string; role?: string; status?: string; schoolId?: string; page?: string }
}) {
  await requireRole("SUPPORT_ADMIN")

  const result = await searchUsers({
    query: searchParams.q?.trim() || undefined,
    role: searchParams.role && isUserRole(searchParams.role) ? searchParams.role : undefined,
    schoolId: searchParams.schoolId || undefined,
    status:
      searchParams.status === "active" || searchParams.status === "disabled"
        ? searchParams.status
        : "all",
    page: Number(searchParams.page ?? 1) || 1,
    limit: 25,
  })

  const pageQuery = (page: number) => {
    const next = new URLSearchParams()
    if (searchParams.q) next.set("q", searchParams.q)
    if (searchParams.role) next.set("role", searchParams.role)
    if (searchParams.status) next.set("status", searchParams.status)
    if (searchParams.schoolId) next.set("schoolId", searchParams.schoolId)
    next.set("page", String(page))
    return `?${next.toString()}`
  }

  return (
    <>
      <PageHeader
        title="School users"
        description="Searches every tenant at once — support does not need to know which school an account belongs to first."
      />

      <UsersNav />
      <UserSearch />

      <section className="rounded-lg border border-sa-border bg-sa-surface">
        <header className="flex items-center justify-between gap-3 border-b border-sa-border px-4 py-2.5">
          <div>
            <h2 className="text-h3">{formatNumber(result.total)} accounts</h2>
            {result.unfiltered && (
              <p className="text-caption text-sa-dim">
                No filters applied — showing the most recently active accounts.
              </p>
            )}
          </div>
        </header>

        {result.users.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-sa-muted">
            No account matches that search.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    School
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Role
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Sessions
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Last login
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.users.map((user) => (
                  <tr key={user.id} className="border-b border-sa-border/60 last:border-0">
                    <td className="px-4 py-2">
                      <p className="text-sa-text">{user.name}</p>
                      <p className="font-mono text-caption text-sa-dim">{user.email}</p>
                    </td>
                    <td className="px-3 py-2">
                      {user.schoolId ? (
                        <Link
                          href={`/console/schools/${user.schoolId}`}
                          className="text-sa-muted hover:text-sa-blue"
                        >
                          {user.school}
                        </Link>
                      ) : (
                        <span className="text-sa-disabled">Platform account</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sa-muted">{USER_ROLE_LABEL[user.role]}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex h-5 items-center gap-1.5 rounded px-2 text-caption font-medium",
                          user.isActive ? "bg-sa-green/15 text-sa-green" : "bg-sa-red/15 text-sa-red",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            user.isActive ? "bg-sa-green" : "bg-sa-red",
                          )}
                          aria-hidden="true"
                        />
                        {user.isActive ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-sa-muted">
                      {user.activeSessions}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-caption tabular-nums text-sa-dim">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString("en-GB")
                        : "never"}
                    </td>
                    <td className="px-4 py-2">
                      <UserActions userId={user.id} email={user.email} isActive={user.isActive} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result.pages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-sa-border px-4 py-2">
            <p className="text-caption text-sa-dim">
              Page {result.page} of {result.pages}
            </p>
            <div className="flex gap-1.5">
              {result.page > 1 && (
                <Link
                  href={pageQuery(result.page - 1)}
                  className="h-7 rounded-md border border-sa-border px-2.5 text-caption leading-7 text-sa-muted transition-colors hover:text-sa-text"
                >
                  Previous
                </Link>
              )}
              {result.page < result.pages && (
                <Link
                  href={pageQuery(result.page + 1)}
                  className="h-7 rounded-md border border-sa-border px-2.5 text-caption leading-7 text-sa-muted transition-colors hover:text-sa-text"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  )
}
