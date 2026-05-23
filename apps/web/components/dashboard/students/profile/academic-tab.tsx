"use client"

import { useQuery } from "@tanstack/react-query"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2 } from "lucide-react"

type GradesResponse = {
  terms: Array<{
    termType: string
    sessionName: string
    average: number
    rows: Array<{
      subject: string
      code: string
      ca: number
      exam: number
      total: number
      letterGrade: string | null
      remark: string | null
    }>
  }>
  trend: Array<{ label: string; average: number }>
}

export function AcademicTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery<GradesResponse>({
    queryKey: ["student-grades", studentId],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/grades`)
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading grades…
      </div>
    )
  }

  if (!data || data.terms.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-12 text-center">
        <p className="text-sm font-medium">No grades recorded yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Once teachers enter scores, results and trends will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data.trend.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average score trend</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="average" stroke="#0D2B5E" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {data.terms.map((t, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t.sessionName} · {t.termType[0] + t.termType.slice(1).toLowerCase()} term
            </CardTitle>
            <p className="text-xs text-muted-foreground">Average: {t.average}</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">CA</TableHead>
                  <TableHead className="text-right">Exam</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Remark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.rows.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <span className="font-medium">{r.subject}</span>{" "}
                      <span className="text-xs text-muted-foreground">({r.code})</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.ca}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.exam}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{r.total}</TableCell>
                    <TableCell>{r.letterGrade ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.remark ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
