"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { StaffDTO } from "@/components/dashboard/staff/profile/types"

type EditState = {
  middleName: string
  phone: string
  gender: "MALE" | "FEMALE" | "OTHER" | ""
  dateOfBirth: string
  stateOfOrigin: string
  nin: string
  bvn: string
  staffType: StaffDTO["staffType"]
  status: StaffDTO["status"]
  department: string
  qualification: string
  experienceYears: string
  gradeLevel: string
  basicSalary: string
  bankName: string
  accountNumber: string
  accountName: string
}

function toLocalDate(value: string | null): string {
  return value ? value.slice(0, 10) : ""
}

function initial(staff: StaffDTO): EditState {
  return {
    middleName: staff.middleName ?? "",
    phone: staff.phone ?? "",
    gender: staff.gender ?? "",
    dateOfBirth: toLocalDate(staff.dateOfBirth),
    stateOfOrigin: staff.stateOfOrigin ?? "",
    nin: "",
    bvn: "",
    staffType: staff.staffType,
    status: staff.status,
    department: staff.department ?? "",
    qualification: staff.qualification ?? "",
    experienceYears: String(staff.experienceYears ?? 0),
    gradeLevel: staff.salaryGrade ?? "",
    basicSalary: staff.basicSalary != null ? String(staff.basicSalary) : "",
    bankName: staff.bankName ?? "",
    accountNumber: staff.accountNumber ?? "",
    accountName: staff.accountName ?? "",
  }
}

export function EditStaffModal({
  staff,
  open,
  onOpenChange,
}: {
  staff: StaffDTO
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [form, setForm] = useState<EditState>(() => initial(staff))

  function update<K extends keyof EditState>(key: K, value: EditState[K]) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        middleName: form.middleName.trim() || null,
        phone: form.phone.trim() || null,
        gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth || null,
        stateOfOrigin: form.stateOfOrigin.trim() || null,
        nin: form.nin.trim() || undefined, // skip if blank (don't clobber)
        bvn: form.bvn.trim() || undefined,
        staffType: form.staffType,
        status: form.status,
        department: form.department.trim() || null,
        qualification: form.qualification.trim() || null,
        experienceYears: Number(form.experienceYears) || 0,
        gradeLevel: form.gradeLevel.trim() || null,
        basicSalary: form.basicSalary === "" ? null : Number(form.basicSalary),
        bankName: form.bankName.trim() || null,
        accountNumber: form.accountNumber.trim() || null,
        accountName: form.accountName.trim() || null,
      }
      const res = await fetch(`/api/staff/${staff.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error ?? "Couldn't save")
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success("Staff updated")
      onOpenChange(false)
      router.refresh()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  })

  function handleOpenChange(next: boolean) {
    if (!next) setForm(initial(staff))
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit staff</DialogTitle>
          <DialogDescription>
            Update personal details, employment status, and salary structure. Subjects and class
            assignments are managed from the Classes & subjects tab.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="personal">
          <TabsList>
            <TabsTrigger value="personal">Personal</TabsTrigger>
            <TabsTrigger value="employment">Employment</TabsTrigger>
            <TabsTrigger value="salary">Salary</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="First name">
              <Input value={staff.firstName} disabled readOnly />
            </Field>
            <Field label="Last name">
              <Input value={staff.lastName} disabled readOnly />
            </Field>
            <Field label="Middle name">
              <Input
                value={form.middleName}
                onChange={(e) => update("middleName", e.target.value)}
              />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </Field>
            <Field label="Gender">
              <Select
                value={form.gender || "__none__"}
                onValueChange={(v) => update("gender", v === "__none__" ? "" : (v as EditState["gender"]))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Not set —</SelectItem>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date of birth">
              <Input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => update("dateOfBirth", e.target.value)}
              />
            </Field>
            <Field label="State of origin">
              <Input
                value={form.stateOfOrigin}
                onChange={(e) => update("stateOfOrigin", e.target.value)}
              />
            </Field>
            <Field label="NIN (leave blank to keep)">
              <Input
                placeholder="11 digits"
                maxLength={11}
                value={form.nin}
                onChange={(e) => update("nin", e.target.value)}
              />
            </Field>
            <Field label="BVN (leave blank to keep)">
              <Input
                placeholder="11 digits"
                maxLength={11}
                value={form.bvn}
                onChange={(e) => update("bvn", e.target.value)}
              />
            </Field>
          </TabsContent>

          <TabsContent value="employment" className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Staff type">
              <Select
                value={form.staffType}
                onValueChange={(v) => update("staffType", v as EditState["staffType"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEACHING">Teaching</SelectItem>
                  <SelectItem value="NON_TEACHING">Non-teaching</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="CONTRACT">Contract</SelectItem>
                  <SelectItem value="NYSC">NYSC</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Employment status">
              <Select
                value={form.status}
                onValueChange={(v) => update("status", v as EditState["status"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ON_LEAVE">On leave</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="RESIGNED">Resigned</SelectItem>
                  <SelectItem value="TERMINATED">Terminated</SelectItem>
                  <SelectItem value="RETIRED">Retired</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department">
              <Input value={form.department} onChange={(e) => update("department", e.target.value)} />
            </Field>
            <Field label="Qualification">
              <Input
                value={form.qualification}
                onChange={(e) => update("qualification", e.target.value)}
              />
            </Field>
            <Field label="Experience (years)">
              <Input
                type="number"
                min={0}
                max={60}
                value={form.experienceYears}
                onChange={(e) => update("experienceYears", e.target.value)}
              />
            </Field>
          </TabsContent>

          <TabsContent value="salary" className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Grade level">
                <Input
                  placeholder="e.g. GL-08"
                  value={form.gradeLevel}
                  onChange={(e) => update("gradeLevel", e.target.value)}
                />
              </Field>
              <Field label="Basic salary (₦)">
                <Input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={form.basicSalary}
                  onChange={(e) => update("basicSalary", e.target.value)}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Allowances and deductions can be edited from the Payroll tab when payroll runs are
              created.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Bank name">
                <Input value={form.bankName} onChange={(e) => update("bankName", e.target.value)} />
              </Field>
              <Field label="Account number">
                <Input
                  value={form.accountNumber}
                  onChange={(e) => update("accountNumber", e.target.value)}
                />
              </Field>
              <Field label="Account name">
                <Input
                  value={form.accountName}
                  onChange={(e) => update("accountName", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Note">
              <Textarea rows={2} disabled placeholder="Editable in a future release." />
            </Field>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
