"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import dayjs from "dayjs"
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const ChartsLoader = () => (
  <div className="grid gap-3 sm:grid-cols-2">
    <Skeleton className="h-72" />
    <Skeleton className="h-72" />
  </div>
)

const AcademicTab = dynamic(
  () => import("./tabs/academic-tab").then((m) => m.AcademicTab),
  { ssr: false, loading: ChartsLoader },
)
const AttendanceTab = dynamic(
  () => import("./tabs/attendance-tab").then((m) => m.AttendanceTab),
  { ssr: false, loading: ChartsLoader },
)
const FinancialTab = dynamic(
  () => import("./tabs/financial-tab").then((m) => m.FinancialTab),
  { ssr: false, loading: ChartsLoader },
)
const EnrollmentTab = dynamic(
  () => import("./tabs/enrollment-tab").then((m) => m.EnrollmentTab),
  { ssr: false, loading: ChartsLoader },
)
const StaffTab = dynamic(
  () => import("./tabs/staff-tab").then((m) => m.StaffTab),
  { ssr: false, loading: ChartsLoader },
)
const PredictionsTab = dynamic(
  () => import("./tabs/predictions-tab").then((m) => m.PredictionsTab),
  { ssr: false, loading: ChartsLoader },
)

type Tab =
  | "academic"
  | "attendance"
  | "financial"
  | "enrollment"
  | "staff"
  | "predictions"

export function AnalyticsClient() {
  const [tab, setTab] = useState<Tab>("academic")
  const [from, setFrom] = useState(dayjs().startOf("year").format("YYYY-MM-DD"))
  const [to, setTo] = useState(dayjs().format("YYYY-MM-DD"))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Cross-cutting reports across academics, attendance, finance, enrolment, staff, and AI risk.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => typeof window !== "undefined" && window.print()}
        >
          <Printer className="mr-1.5 h-4 w-4" />
          Print / PDF
        </Button>
      </div>

      <Card>
        <CardContent className="grid items-end gap-3 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFrom(dayjs().startOf("year").format("YYYY-MM-DD"))
              setTo(dayjs().format("YYYY-MM-DD"))
            }}
          >
            Year to date
          </Button>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="academic">Academic</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="enrollment">Enrolment</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="predictions">AI predictions</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "academic" && <AcademicTab from={from} to={to} />}
      {tab === "attendance" && <AttendanceTab from={from} to={to} />}
      {tab === "financial" && <FinancialTab from={from} to={to} />}
      {tab === "enrollment" && <EnrollmentTab from={from} to={to} />}
      {tab === "staff" && <StaffTab from={from} to={to} />}
      {tab === "predictions" && <PredictionsTab from={from} to={to} />}
    </div>
  )
}
