"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ANALYTICS_COLOURS,
  EmptyBlock,
  LoadingBlock,
  SectionCard,
  heatColour,
  useAnalytics,
} from "../primitives"

type AcademicData = {
  classes: { classId: string; name: string; average: number; count: number }[]
  heatmap: {
    classId: string
    className: string
    cells: {
      subjectId: string
      subjectName: string
      subjectCode: string
      average: number
    }[]
  }[]
  subjects: { id: string; name: string; code: string }[]
}

export function AcademicTab({ from, to }: { from: string; to: string }) {
  const q = useAnalytics<AcademicData>("academic", from, to)
  if (q.isLoading) return <LoadingBlock />
  const data = q.data
  if (!data || data.classes.length === 0) {
    return <EmptyBlock message="No grades recorded in this range yet." />
  }

  return (
    <div className="grid gap-3">
      <SectionCard title="Class averages" hint="Total score, all subjects">
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <BarChart
              data={data.classes}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="average" fill={ANALYTICS_COLOURS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard
        title="Subject weakness heatmap"
        hint="Cell = average score for that class × subject"
      >
        {data.subjects.length === 0 ? (
          <p className="text-xs text-muted-foreground">No subject data in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">Class</th>
                  {data.subjects.map((s) => (
                    <th key={s.id} className="p-2 text-center">
                      {s.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.heatmap.map((row) => {
                  const cellMap = new Map(row.cells.map((c) => [c.subjectId, c]))
                  return (
                    <tr key={row.classId} className="border-b last:border-b-0">
                      <td className="p-2 font-medium">{row.className}</td>
                      {data.subjects.map((s) => {
                        const cell = cellMap.get(s.id)
                        if (!cell) {
                          return (
                            <td key={s.id} className="p-1">
                              <div className="rounded bg-muted/40 p-1.5 text-center text-[10px] text-muted-foreground">
                                —
                              </div>
                            </td>
                          )
                        }
                        return (
                          <td key={s.id} className="p-1">
                            <div
                              className={`rounded p-1.5 text-center text-[11px] font-semibold ${heatColour(cell.average)}`}
                              title={`${cell.subjectName}: ${cell.average}`}
                            >
                              {cell.average}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
