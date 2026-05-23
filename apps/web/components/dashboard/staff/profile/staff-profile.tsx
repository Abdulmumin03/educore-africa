"use client"

import { useState } from "react"
import Link from "next/link"
import dayjs from "dayjs"
import { Edit, MessageSquare, MoreHorizontal, Printer } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OverviewTab } from "@/components/dashboard/staff/profile/overview-tab"
import { ClassesTab } from "@/components/dashboard/staff/profile/classes-tab"
import { AttendanceTab } from "@/components/dashboard/staff/profile/attendance-tab"
import { LeaveTab } from "@/components/dashboard/staff/profile/leave-tab"
import { PayrollTab } from "@/components/dashboard/staff/profile/payroll-tab"
import { PerformanceTab } from "@/components/dashboard/staff/profile/performance-tab"
import { CpdTab } from "@/components/dashboard/staff/profile/cpd-tab"
import { EditStaffModal } from "@/components/dashboard/staff/profile/edit-staff-modal"
import type { StaffDTO } from "@/components/dashboard/staff/profile/types"

export function StaffProfile({
  staff,
  canWrite,
  isSelf,
  currentUserRole,
}: {
  staff: StaffDTO
  canWrite: boolean
  isSelf: boolean
  currentUserRole: string
}) {
  const [editOpen, setEditOpen] = useState(false)
  const fullName = [staff.firstName, staff.middleName, staff.lastName].filter(Boolean).join(" ")
  const initials = (staff.firstName[0] ?? "") + (staff.lastName[0] ?? "")

  const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    ACTIVE: "default",
    ON_LEAVE: "secondary",
    SUSPENDED: "destructive",
    RESIGNED: "outline",
    TERMINATED: "destructive",
    RETIRED: "outline",
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {staff.avatarUrl ? <AvatarImage src={staff.avatarUrl} alt={fullName} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs">{staff.staffNumber}</span>
                <span>·</span>
                <span>{staff.role.replace("_", " ")}</span>
                {staff.department && (
                  <>
                    <span>·</span>
                    <span>{staff.department}</span>
                  </>
                )}
                <Badge variant={statusVariant[staff.status] ?? "outline"}>
                  {staff.status.replace("_", " ")}
                </Badge>
                {isSelf && <Badge variant="outline">You</Badge>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canWrite}
              onClick={() => setEditOpen(true)}
            >
              <Edit className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" />
              Print ID
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/messages">
                <MessageSquare className="mr-1.5 h-4 w-4" />
                Message
              </Link>
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="classes">Classes & subjects</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="cpd">CPD</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab staff={staff} />
        </TabsContent>
        <TabsContent value="classes">
          <ClassesTab staffId={staff.id} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceTab staffId={staff.id} isSelf={isSelf} />
        </TabsContent>
        <TabsContent value="leave">
          <LeaveTab staffId={staff.id} isSelf={isSelf} />
        </TabsContent>
        <TabsContent value="payroll">
          <PayrollTab staffId={staff.id} staff={staff} />
        </TabsContent>
        <TabsContent value="performance">
          <PerformanceTab
            staffId={staff.id}
            staffName={`${staff.firstName} ${staff.lastName}`}
            role={staff.role}
            department={staff.department}
            subjects={staff.subjects.map((s) => s.name)}
            canEvaluate={["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"].includes(currentUserRole)}
          />
        </TabsContent>
        <TabsContent value="cpd">
          <CpdTab staffId={staff.id} canWrite={canWrite} />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Profile updated · viewing as of {dayjs().format("D MMM YYYY")}
      </p>

      <EditStaffModal staff={staff} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}
