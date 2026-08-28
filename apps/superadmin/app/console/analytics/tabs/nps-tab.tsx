import { npsSummary } from "@/lib/analytics"
import { cn, formatNumber } from "@/lib/utils"
import { NpsGauge } from "../nps-gauge"
import { Panel, Unmeasured } from "../panel"

const ROLE_LABEL: Record<string, string> = {
  SCHOOL_ADMIN: "School admins",
  TEACHER: "Teachers",
  PARENT: "Parents",
  STUDENT: "Students",
}

export async function NpsTab() {
  const nps = await npsSummary(12)

  const total = nps.promoters + nps.passives + nps.detractors
  const share = (count: number) => (total > 0 ? (count / total) * 100 : 0)
  const maxWord = nps.words.reduce((max, entry) => Math.max(max, entry.count), 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Panel title="Net Promoter Score" subtitle={`${formatNumber(nps.responses)} responses, last 12 months`}>
          <NpsGauge score={nps.score} />
        </Panel>

        <Panel title="Response mix" subtitle="Promoters score 9–10, passives 7–8, detractors 0–6">
          {total === 0 ? (
            <p className="text-body text-sa-dim">No survey responses yet.</p>
          ) : (
            <>
              <div className="flex h-8 w-full gap-0.5 overflow-hidden rounded" aria-hidden="true">
                <div className="bg-sa-green" style={{ width: `${share(nps.promoters)}%` }} />
                <div className="bg-sa-raised" style={{ width: `${share(nps.passives)}%` }} />
                <div className="bg-sa-red" style={{ width: `${share(nps.detractors)}%` }} />
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-3">
                {[
                  { label: "Promoters", count: nps.promoters, dot: "bg-sa-green" },
                  { label: "Passives", count: nps.passives, dot: "bg-sa-raised" },
                  { label: "Detractors", count: nps.detractors, dot: "bg-sa-red" },
                ].map((entry) => (
                  <div key={entry.label}>
                    <dt className="flex items-center gap-1.5 text-caption text-sa-dim">
                      <span className={cn("h-2 w-2 rounded-full", entry.dot)} aria-hidden="true" />
                      {entry.label}
                    </dt>
                    <dd className="font-mono text-h2 tabular-nums text-sa-text">
                      {formatNumber(entry.count)}
                      <span className="ml-1.5 text-caption font-normal text-sa-dim">
                        {share(entry.count).toFixed(0)}%
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </Panel>
      </div>

      <Panel title="By role" subtitle="Who is answering, and how they score">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {nps.byRole.map((entry) => (
            <div key={entry.role} className="rounded-md border border-sa-border bg-sa-raised/40 p-3">
              <p className="text-caption uppercase tracking-wide text-sa-dim">
                {ROLE_LABEL[entry.role] ?? entry.role}
              </p>
              <p
                className={cn(
                  "mt-1 font-mono text-h1 tabular-nums",
                  entry.score === null
                    ? "text-sa-disabled"
                    : entry.score >= 30
                      ? "text-sa-green"
                      : entry.score >= 0
                        ? "text-sa-amber"
                        : "text-sa-red",
                )}
              >
                {entry.score === null ? "—" : `${entry.score > 0 ? "+" : ""}${entry.score.toFixed(0)}`}
              </p>
              <p className="text-caption text-sa-dim">
                {formatNumber(entry.responses)} response{entry.responses === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Trend" subtitle="Monthly score — a month with no responses is a gap, not a zero">
        <div className="flex items-end gap-1.5" style={{ height: 140 }}>
          {nps.trend.map((month) => {
            // Map −100..+100 onto the column height, with the zero line at 50%.
            const height = month.score === null ? 0 : Math.abs(month.score) / 2
            const positive = (month.score ?? 0) >= 0

            return (
              <div key={month.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="relative flex h-[104px] w-full flex-col justify-center">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-sa-border" aria-hidden="true" />
                  {month.score === null ? (
                    <div
                      className="mx-auto h-3 w-3 rounded-full border border-dashed border-sa-border"
                      title={`${month.label}: no responses`}
                    />
                  ) : (
                    <div
                      title={`${month.label}: ${month.score.toFixed(0)} from ${month.responses} responses`}
                      className={cn(
                        "mx-auto w-full max-w-[26px] rounded",
                        positive ? "self-end bg-sa-green" : "self-start bg-sa-red",
                      )}
                      style={{
                        height: `${Math.max(2, height)}%`,
                        marginTop: positive ? "auto" : 0,
                        marginBottom: positive ? 0 : "auto",
                        transform: positive ? "translateY(-52px)" : "translateY(52px)",
                      }}
                    />
                  )}
                </div>
                <span className="font-mono text-[10px] tabular-nums text-sa-dim">{month.label}</span>
              </div>
            )
          })}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="What comes up most"
          subtitle="Word frequency across every comment, stop-words removed"
        >
          {nps.words.length === 0 ? (
            <p className="text-body text-sa-dim">No comments to read yet.</p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
              {nps.words.map((entry) => {
                // Size carries the count; every word keeps text-token colour so
                // the cloud never encodes anything in hue alone.
                const scale = maxWord > 0 ? entry.count / maxWord : 0
                const size = 12 + Math.round(scale * 14)
                return (
                  <span
                    key={entry.word}
                    title={`${entry.word}: ${entry.count} mention${entry.count === 1 ? "" : "s"}`}
                    style={{ fontSize: `${size}px` }}
                    className={cn(scale > 0.6 ? "text-sa-text" : scale > 0.3 ? "text-sa-muted" : "text-sa-dim")}
                  >
                    {entry.word}
                    <span className="ml-1 font-mono text-[10px] tabular-nums text-sa-disabled">
                      {entry.count}
                    </span>
                  </span>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Recent comments"
          subtitle={
            nps.comments.length > 0
              ? `Newest first · ${formatNumber(nps.comments.length)} with a comment`
              : undefined
          }
        >
          {nps.comments.length === 0 ? (
            <p className="text-body text-sa-dim">No comments to show.</p>
          ) : (
            // Capped height rather than an unbounded list: thirty comments
            // would stretch the page past the word cloud beside it.
            <ul className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {nps.comments.map((entry, index) => (
                <li key={`${entry.school}-${index}`} className="border-b border-sa-border/60 pb-3 last:border-0 last:pb-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
                        entry.score >= 9
                          ? "bg-sa-green/15 text-sa-green"
                          : entry.score >= 7
                            ? "bg-sa-raised text-sa-muted"
                            : "bg-sa-red/15 text-sa-red",
                      )}
                    >
                      {entry.score}/10
                    </span>
                    <span className="text-caption text-sa-dim">
                      {ROLE_LABEL[entry.role] ?? entry.role} · {entry.school}
                    </span>
                  </div>
                  <p className="text-body text-sa-muted">{entry.comment}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Unmeasured>
        CSAT is not shown: support tickets carry no satisfaction survey, so there is nothing to
        average. NPS here comes from the survey responses schools actually submitted.
      </Unmeasured>
    </div>
  )
}
