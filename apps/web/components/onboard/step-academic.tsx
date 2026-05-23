"use client"

import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { stepAcademicSchema, type StepAcademicInput, SECTIONS } from "@/lib/auth-schemas"

const SECTION_LABEL: Record<(typeof SECTIONS)[number], { title: string; desc: string }> = {
  NURSERY: { title: "Nursery", desc: "Nursery 1–3" },
  PRIMARY: { title: "Primary", desc: "Primary 1–6" },
  JSS: { title: "Junior Secondary", desc: "JSS 1–3" },
  SSS: { title: "Senior Secondary", desc: "SS 1–3" },
}

type Props = {
  defaults?: StepAcademicInput
  onBack: () => void
  onSubmit: (values: StepAcademicInput) => void
}

export function StepAcademic({ defaults, onBack, onSubmit }: Props) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StepAcademicInput>({
    resolver: zodResolver(stepAcademicSchema),
    defaultValues: defaults ?? { sections: ["PRIMARY", "JSS"], armsPerClass: 2, sessionName: "2025/2026" },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div>
        <h2 className="text-xl font-semibold">Academic structure</h2>
        <p className="text-sm text-muted-foreground">
          Tell us which sections to activate and how many arms per class.
        </p>
      </div>

      <div className="space-y-3">
        <Label>Sections to activate</Label>
        <Controller
          control={control}
          name="sections"
          render={({ field }) => (
            <div className="grid gap-3 sm:grid-cols-2">
              {SECTIONS.map((s) => {
                const checked = field.value?.includes(s)
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      const current = field.value ?? []
                      field.onChange(
                        checked ? current.filter((x) => x !== s) : [...current, s],
                      )
                    }}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-4 text-left transition",
                      checked ? "border-primary bg-primary/5" : "border-muted hover:border-foreground/30",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                        checked && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {checked ? "✓" : ""}
                    </span>
                    <div>
                      <div className="font-medium">{SECTION_LABEL[s].title}</div>
                      <div className="text-xs text-muted-foreground">{SECTION_LABEL[s].desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        />
        {errors.sections && <p className="text-sm text-destructive">{errors.sections.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="armsPerClass">Arms per class</Label>
          <Input
            id="armsPerClass"
            type="number"
            min={1}
            max={10}
            {...register("armsPerClass", { valueAsNumber: true })}
            aria-invalid={!!errors.armsPerClass}
          />
          <p className="text-xs text-muted-foreground">
            E.g. 2 creates A and B for every class in the activated sections.
          </p>
          {errors.armsPerClass && <p className="text-sm text-destructive">{errors.armsPerClass.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="sessionName">Current academic session</Label>
          <Input id="sessionName" placeholder="2025/2026" {...register("sessionName")} aria-invalid={!!errors.sessionName} />
          {errors.sessionName && <p className="text-sm text-destructive">{errors.sessionName.message}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button type="submit">Continue</Button>
      </div>
    </form>
  )
}
