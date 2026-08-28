import { Panel } from "@/components/shared/panel"
import { listDeletionRecords } from "@/lib/compliance"

export async function DeletionsTab() {
  const records = await listDeletionRecords()

  return (
    <Panel
      title="Erasure records"
      subtitle="Permanent proof that a deletion happened. These outlive the data they describe — that is the point."
      bodyClassName="p-0"
    >
      {records.length === 0 ? (
        <p className="px-4 py-10 text-center text-body text-sa-muted">
          No erasures have been executed.
        </p>
      ) : (
        <ul>
          {records.map((record) => (
            <li key={record.id} className="border-b border-sa-border/60 px-4 py-3 last:border-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-body text-sa-text">{record.subjectName}</p>
                  <p className="font-mono text-caption text-sa-dim">{record.subjectEmail}</p>
                </div>
                <p className="text-caption text-sa-dim">
                  {record.school ?? "no school"} · {record.method} · by {record.executedBy} ·{" "}
                  {new Date(record.executedAt).toLocaleString("en-GB")}
                </p>
              </div>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(record.summary).map(([key, value]) => (
                  <div key={key} className="flex items-baseline gap-1.5">
                    <dt className="text-caption text-sa-dim">{key.replace(/_/g, " ")}</dt>
                    <dd className="font-mono text-caption tabular-nums text-sa-muted">{value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
