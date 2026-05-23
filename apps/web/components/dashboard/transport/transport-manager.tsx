"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FleetTab } from "@/components/dashboard/transport/fleet-tab"
import { RoutesTab } from "@/components/dashboard/transport/routes-tab"
import { TransportAssignmentsTab } from "@/components/dashboard/transport/assignments-tab"
import { BoardTab } from "@/components/dashboard/transport/board-tab"

// Leaflet uses `window` on mount — load the map only on the client.
const LiveMapTab = dynamic(
  () =>
    import("@/components/dashboard/transport/live-map-tab").then(
      (m) => m.LiveMapTab,
    ),
  { ssr: false },
)

type Tab = "fleet" | "routes" | "assignments" | "board" | "map"

export function TransportManager({
  isAdmin,
  drivers,
}: {
  isAdmin: boolean
  drivers: { id: string; name: string }[]
}) {
  const [tab, setTab] = useState<Tab>("fleet")

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transport</h1>
        <p className="text-sm text-muted-foreground">
          Fleet, routes, student assignments, boarding roster, and live GPS tracking.
        </p>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="fleet">Fleet</TabsTrigger>
          <TabsTrigger value="routes">Routes</TabsTrigger>
          {isAdmin && <TabsTrigger value="assignments">Student assignments</TabsTrigger>}
          <TabsTrigger value="board">Boarding</TabsTrigger>
          <TabsTrigger value="map">Live map</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "fleet" && <FleetTab isAdmin={isAdmin} drivers={drivers} />}
      {tab === "routes" && <RoutesTab isAdmin={isAdmin} />}
      {tab === "assignments" && isAdmin && <TransportAssignmentsTab />}
      {tab === "board" && <BoardTab />}
      {tab === "map" && <LiveMapTab />}
    </div>
  )
}
