import Link from "next/link"

import { Panel } from "@/components/shared/panel"
import { listDataAccess } from "@/lib/data-access"
import { formatNumber } from "@/lib/utils"

const SCOPE_LABEL: Record<string, string> = {
  "school.overview": "School overview",
  "school.users": "User accounts",
  "school.students": "Student records",
  "school.financials": "Invoices and payments",
  "school.usage": "Usage metrics",
  "school.activity": "Activity log",
  "school.support": "Support history",
  "school.impersonation": "Signed in as the school",
}

export async function AccessTab({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const result = await listDataAccess({
    schoolId: searchParams.schoolId,
    staffId: searchParams.staffId,
    page: Number(searchParams.page ?? 1) || 1,
    limit: 50,
  })

  return (
    <div className="space-y-3">
      <Panel
        title="Cross-tenant reads"
        subtitle="Every time EduCore staff opened a school's data. This is the NDPR obligation the general audit trail does not cover — that one records what was changed, this one records what was seen."
        bodyClassName="p-0"
      >
        {result.rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-body text-sa-muted">
            No cross-tenant reads recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-b border-sa-border text-caption uppercase tracking-wide text-sa-dim">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Timestamp
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Staff member
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    School
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Data accessed
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Duration
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    IP
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id} className="border-b border-sa-border/60 last:border-0">
                    <td className="px-4 py-1.5 font-mono text-caption tabular-nums text-sa-dim">
                      {new Date(row.at).toLocaleString("en-GB")}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-sa-text">{row.staff}</span>
                      <span className="ml-2 text-caption text-sa-dim">
                        {row.staffRole.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/console/schools/${row.schoolId}`}
                        className="text-sa-muted hover:text-sa-blue"
                      >
                        {row.school}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-sa-muted">
                      {SCOPE_LABEL[row.scope] ?? row.scope}
                      <span className="ml-2 font-mono text-caption text-sa-dim">{row.path}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sa-muted">
                      {row.durationMs === null ? (
                        <span className="text-sa-disabled" title="The console records when a view opened, not when it was closed">
                          —
                        </span>
                      ) : (
                        `${(row.durationMs / 1000).toFixed(1)}s`
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-caption tabular-nums text-sa-dim">
                      {row.ipAddress}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="border-t border-sa-border px-4 py-2 text-caption text-sa-dim">
          {formatNumber(result.total)} record{result.total === 1 ? "" : "s"} · page {result.page} of{" "}
          {result.pages}. Duration is blank for most rows: the console knows when a page was opened,
          not when the reader looked away, and inventing a dwell time would be worse than leaving it
          empty.
        </p>
      </Panel>
    </div>
  )
}
