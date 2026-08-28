import { prisma } from "@/lib/db"
import { cn } from "@/lib/utils"

const DATE: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }

export async function UsersTab({ schoolId }: { schoolId: string }) {
  const users = await prisma.user.findMany({
    where: { schoolId, deletedAt: null },
    orderBy: [{ role: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      _count: { select: { sessions: true } },
    },
  })

  return (
    <section className="overflow-hidden rounded-lg border border-sa-border bg-sa-surface">
      <header className="flex items-start justify-between gap-3 border-b border-sa-border px-4 py-2.5">
        <div>
          <h2 className="text-h3">User accounts</h2>
          <p className="text-caption text-sa-dim">
            Everyone with a login at this school. Account actions are read-only in the console for
            now — locking and password resets belong to the school&apos;s own admin.
          </p>
        </div>
        <span className="tabular shrink-0 text-caption text-sa-muted">{users.length} accounts</span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead>
            <tr className="border-b border-sa-border bg-sa-base/40">
              {["Role", "Name", "Email", "Last login", "Sessions", "Status"].map((head) => (
                <th
                  key={head}
                  scope="col"
                  className="h-8 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-sa-dim"
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-sa-border last:border-b-0 hover:bg-sa-raised">
                <td className="h-9 px-3">
                  <span className="rounded bg-sa-raised px-1.5 py-0.5 text-caption capitalize text-sa-muted">
                    {user.role.replace(/_/g, " ").toLowerCase()}
                  </span>
                </td>
                <td className="h-9 px-3">{`${user.firstName} ${user.lastName}`.trim()}</td>
                <td className="h-9 px-3 text-sa-muted">{user.email}</td>
                <td className="tabular h-9 px-3 text-sa-muted">
                  {user.lastLoginAt ? user.lastLoginAt.toLocaleDateString("en-GB", DATE) : "never"}
                </td>
                <td className="tabular h-9 px-3 text-sa-muted">{user._count.sessions}</td>
                <td className="h-9 px-3">
                  <span
                    className={cn(
                      "inline-flex h-5 items-center gap-1.5 rounded px-2 text-caption font-medium",
                      user.isActive ? "bg-sa-green/15 text-sa-green" : "bg-sa-dim/15 text-sa-dim",
                    )}
                  >
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full", user.isActive ? "bg-sa-green" : "bg-sa-dim")}
                      aria-hidden="true"
                    />
                    {user.isActive ? "Active" : "Disabled"}
                  </span>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-body text-sa-dim">
                  No user accounts at this school.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
