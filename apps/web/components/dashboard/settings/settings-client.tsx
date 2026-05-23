"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProfileTab, type SchoolProfile } from "@/components/dashboard/settings/profile-tab"
import { CalendarTab, type AcademicYearDTO, type HolidayDTO } from "@/components/dashboard/settings/calendar-tab"
import { ClassesTab, type ClassDTO } from "@/components/dashboard/settings/classes-tab"
import { SubjectsTab, type SubjectDTO } from "@/components/dashboard/settings/subjects-tab"
import { GradingTab } from "@/components/dashboard/settings/grading-tab"
import { NotificationsTab } from "@/components/dashboard/settings/notifications-tab"
import type { GradingSettings, NotificationSettings } from "@/lib/school-settings"

type Props = {
  school: SchoolProfile
  academicYears: AcademicYearDTO[]
  holidays: HolidayDTO[]
  classes: ClassDTO[]
  subjects: SubjectDTO[]
  settings: { grading: GradingSettings; notifications: NotificationSettings }
}

export function SettingsClient(props: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">School settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your school&apos;s profile, calendar, classes, subjects and grading.
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="profile">School Profile</TabsTrigger>
          <TabsTrigger value="calendar">Academic Calendar</TabsTrigger>
          <TabsTrigger value="classes">Classes & Sections</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
          <TabsTrigger value="grading">Grading System</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab school={props.school} />
        </TabsContent>
        <TabsContent value="calendar">
          <CalendarTab academicYears={props.academicYears} holidays={props.holidays} />
        </TabsContent>
        <TabsContent value="classes">
          <ClassesTab classes={props.classes} />
        </TabsContent>
        <TabsContent value="subjects">
          <SubjectsTab subjects={props.subjects} />
        </TabsContent>
        <TabsContent value="grading">
          <GradingTab initial={props.settings.grading} notifications={props.settings.notifications} />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab
            initial={props.settings.notifications}
            grading={props.settings.grading}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
