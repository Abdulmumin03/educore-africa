"use client"

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HostelSetupTab } from "@/components/dashboard/hostel/setup-tab"
import { HostelAssignmentsTab } from "@/components/dashboard/hostel/assignments-tab"
import { HostelExeatTab } from "@/components/dashboard/hostel/exeat-tab"
import { HostelIncidentsTab } from "@/components/dashboard/hostel/incidents-tab"
import { HostelMaintenanceTab } from "@/components/dashboard/hostel/maintenance-tab"

type Tab = "setup" | "assignments" | "exeat" | "incidents" | "maintenance"

export function HostelManager({
  isAdmin,
  houseparents,
}: {
  isAdmin: boolean
  houseparents: { id: string; name: string }[]
}) {
  const [tab, setTab] = useState<Tab>("setup")

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hostel</h1>
        <p className="text-sm text-muted-foreground">
          Hostels, rooms, room assignments, exeat workflow, incidents, and maintenance.
        </p>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="exeat">Exeat</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "setup" && (
        <HostelSetupTab isAdmin={isAdmin} houseparents={houseparents} />
      )}
      {tab === "assignments" && <HostelAssignmentsTab />}
      {tab === "exeat" && <HostelExeatTab isStaff />}
      {tab === "incidents" && <HostelIncidentsTab />}
      {tab === "maintenance" && <HostelMaintenanceTab isAdmin={isAdmin} />}
    </div>
  )
}
