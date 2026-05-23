"use client"

import { useState } from "react"
import type { UserRole } from "@prisma/client"
import { Check, Info, Lock, Minus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  PERMISSION_GROUP_LABELS,
  PERMISSION_GROUPS,
  ROLE_DESCRIPTIONS,
  ROLE_PERMISSIONS,
  type Crud,
  type PermissionGroup,
} from "@/lib/permissions"

const CRUDS: Crud[] = ["CREATE", "READ", "UPDATE", "DELETE"]

export function PermissionMatrix({
  rolesWithCounts,
}: {
  rolesWithCounts: { role: UserRole; count: number }[]
}) {
  const [selectedRole, setSelectedRole] = useState<UserRole>(rolesWithCounts[0]?.role ?? "SCHOOL_ADMIN")
  const perms = ROLE_PERMISSIONS[selectedRole]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Roles & permissions</h1>
        <p className="text-sm text-muted-foreground">
          Read-only view of the permissions baked into each role.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-2 p-3 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Permissions are hard-coded into the application — they can&apos;t be edited per
            school today. The matrix below documents what each role can do; route gates
            enforce these checks server-side.
          </span>
        </CardContent>
      </Card>

      {/* Roles list */}
      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardContent className="space-y-1 p-2">
            <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Roles
            </p>
            <ul>
              {rolesWithCounts.map(({ role, count }) => {
                const isActive = role === selectedRole
                return (
                  <li key={role}>
                    <button
                      type="button"
                      onClick={() => setSelectedRole(role)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                        isActive ? "bg-primary/10 text-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {count}
                      </Badge>
                    </button>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <h2 className="text-base font-semibold">
                  {selectedRole.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {ROLE_DESCRIPTIONS[selectedRole]}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="p-2">Area</th>
                    {CRUDS.map((c) => (
                      <th key={c} className="p-2 text-center">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_GROUPS.map((group) => (
                    <PermissionRow
                      key={group}
                      label={PERMISSION_GROUP_LABELS[group]}
                      cruds={perms[group as PermissionGroup]}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <p className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              <span className="font-medium">Need finer-grained custom roles?</span>{" "}
              The current product locks in 11 system roles. Custom role support is a
              schema-level upgrade (Role + RolePermission tables); flag this in your
              feedback if you need it.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PermissionRow({ label, cruds }: { label: string; cruds: Crud[] }) {
  const set = new Set(cruds)
  return (
    <tr className="border-b last:border-b-0">
      <td className="p-2 font-medium">{label}</td>
      {CRUDS.map((c) => (
        <td key={c} className="p-2 text-center">
          {set.has(c) ? (
            <Check className="mx-auto h-4 w-4 text-emerald-600" />
          ) : (
            <Minus className="mx-auto h-3 w-3 text-muted-foreground/50" />
          )}
        </td>
      ))}
    </tr>
  )
}
