"use client"

import Link from "next/link"
import { useState } from "react"
import dayjs from "dayjs"
import { Edit, MessageSquare, MoreHorizontal, Printer } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OverviewTab } from "@/components/dashboard/students/profile/overview-tab"
import { AcademicTab } from "@/components/dashboard/students/profile/academic-tab"
import { AttendanceTab } from "@/components/dashboard/students/profile/attendance-tab"
import { FinanceTab } from "@/components/dashboard/students/profile/finance-tab"
import { HealthTab } from "@/components/dashboard/students/profile/health-tab"
import { BehaviorTab } from "@/components/dashboard/students/profile/behavior-tab"
import { DocumentsTab } from "@/components/dashboard/students/profile/documents-tab"
import { EditStudentModal } from "@/components/dashboard/students/profile/edit-student-modal"
import type { StudentDTO } from "@/components/dashboard/students/profile/types"

export function StudentProfile({ student, canWrite }: { student: StudentDTO; canWrite: boolean }) {
  const [editOpen, setEditOpen] = useState(false)
  const fullName = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ")
  const initials = (student.firstName[0] ?? "") + (student.lastName[0] ?? "")

  const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    ACTIVE: "default",
    GRADUATED: "secondary",
    TRANSFERRED: "secondary",
    WITHDRAWN: "outline",
    SUSPENDED: "destructive",
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {student.avatarUrl ? <AvatarImage src={student.avatarUrl} alt={fullName} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs">{student.admissionNumber}</span>
                {student.enrollment && (
                  <>
                    <span>·</span>
                    <span>
                      {student.enrollment.className} · Arm {student.enrollment.sectionName}
                    </span>
                    <span>·</span>
                    <span>{student.enrollment.academicYearName}</span>
                  </>
                )}
                <Badge variant={statusVariant[student.status] ?? "outline"}>
                  {student.status[0] + student.status.slice(1).toLowerCase()}
                </Badge>
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
          <TabsTrigger value="academic">Academic</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="behavior">Behavior</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab student={student} />
        </TabsContent>
        <TabsContent value="academic">
          <AcademicTab studentId={student.id} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceTab studentId={student.id} />
        </TabsContent>
        <TabsContent value="finance">
          <FinanceTab student={student} />
        </TabsContent>
        <TabsContent value="health">
          <HealthTab student={student} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="behavior">
          <BehaviorTab studentId={student.id} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab student={student} canWrite={canWrite} />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Profile updated · viewing as of {dayjs().format("D MMM YYYY")}
      </p>

      <EditStudentModal student={student} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}
