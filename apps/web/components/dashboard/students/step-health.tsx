"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { healthStepSchema, type HealthStepInput } from "@/lib/student-schemas"

export function StepHealth({
  defaults,
  onBack,
  onSubmit,
}: {
  defaults?: HealthStepInput
  onBack: () => void
  onSubmit: (v: HealthStepInput) => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
  } = useForm<HealthStepInput>({
    resolver: zodResolver(healthStepSchema),
    defaultValues:
      defaults ?? {
        emergencyMedicalConsent: true,
        knownAllergies: "",
        disabilities: "",
        specialNeeds: "",
        doctorName: "",
        doctorPhone: "",
        medicalInsurance: "",
      },
  })

  const consent = watch("emergencyMedicalConsent")

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <h2 className="text-xl font-semibold">Health information</h2>
        <p className="text-sm text-muted-foreground">
          Used in emergencies — kept visible only to authorised staff.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="knownAllergies">Known allergies</Label>
          <Textarea id="knownAllergies" rows={2} {...register("knownAllergies")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="disabilities">Disabilities</Label>
          <Textarea id="disabilities" rows={2} {...register("disabilities")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="specialNeeds">Special needs</Label>
          <Textarea id="specialNeeds" rows={2} {...register("specialNeeds")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doctorName">Family doctor</Label>
          <Input id="doctorName" {...register("doctorName")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doctorPhone">Doctor phone</Label>
          <Input id="doctorPhone" type="tel" placeholder="+2348012345678" {...register("doctorPhone")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="medicalInsurance">Medical insurance / HMO</Label>
          <Input id="medicalInsurance" {...register("medicalInsurance")} />
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={consent}
          onChange={(e) => setValue("emergencyMedicalConsent", e.target.checked)}
        />
        <span>
          <span className="font-medium">Consent to emergency medical care.</span>
          <span className="block text-xs text-muted-foreground">
            School staff may authorise urgent treatment when guardians can&apos;t be reached.
          </span>
        </span>
      </label>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>← Back</Button>
        <Button type="submit">Continue</Button>
      </div>
    </form>
  )
}
