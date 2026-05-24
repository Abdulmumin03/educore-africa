"use client"

import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
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
    defaultValues:
      defaults ?? { sections: ["PRIMARY", "JSS"], armsPerClass: 2, sessionName: "2025/2026" },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-7" noValidate>
      <ScrollReveal>
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Step 3 of 5
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-navy md:text-3xl">
            Academic structure
          </h2>
          <p className="mt-1.5 text-sm text-navy/65">
            Tell us which sections to activate and how many arms per class.
          </p>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={80}>
        <div className="space-y-3">
          <Label className="text-navy">Sections to activate</Label>
          <Controller
            control={control}
            name="sections"
            render={({ field }) => (
              <div className="grid gap-3 sm:grid-cols-2">
                {SECTIONS.map((s, i) => {
                  const checked = field.value?.includes(s)
                  return (
                    <ScrollReveal key={s} delay={120 + i * 70}>
                      <button
                        type="button"
                        onClick={() => {
                          const current = field.value ?? []
                          field.onChange(
                            checked ? current.filter((x) => x !== s) : [...current, s],
                          )
                        }}
                        className={cn(
                          "group relative flex w-full items-start gap-3 overflow-hidden rounded-xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                          checked
                            ? "border-amber-400 bg-amber-50/60 ring-1 ring-amber-300/40"
                            : "border-navy/10 hover:border-navy/25",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
                            checked
                              ? "border-amber-500 bg-amber-400 text-navy"
                              : "border-navy/20 bg-white text-transparent",
                          )}
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        <div>
                          <div className="font-semibold text-navy">
                            {SECTION_LABEL[s].title}
                          </div>
                          <div className="text-xs text-navy/55">
                            {SECTION_LABEL[s].desc}
                          </div>
                        </div>
                      </button>
                    </ScrollReveal>
                  )
                })}
              </div>
            )}
          />
          {errors.sections && (
            <p className="text-sm text-destructive">{errors.sections.message}</p>
          )}
        </div>
      </ScrollReveal>

      <ScrollReveal delay={420}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="armsPerClass" className="text-navy">Arms per class</Label>
            <Input
              id="armsPerClass"
              type="number"
              min={1}
              max={10}
              {...register("armsPerClass", { valueAsNumber: true })}
              aria-invalid={!!errors.armsPerClass}
            />
            <p className="text-xs text-navy/55">
              E.g. 2 creates A and B for every class in the activated sections.
            </p>
            {errors.armsPerClass && (
              <p className="text-sm text-destructive">{errors.armsPerClass.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sessionName" className="text-navy">
              Current academic session
            </Label>
            <Input
              id="sessionName"
              placeholder="2025/2026"
              {...register("sessionName")}
              aria-invalid={!!errors.sessionName}
            />
            {errors.sessionName && (
              <p className="text-sm text-destructive">{errors.sessionName.message}</p>
            )}
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={500}>
        <div className="flex items-center justify-between border-t border-navy/10 pt-5">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="text-navy/65 hover:bg-cream-soft hover:text-navy"
          >
            ← Back
          </Button>
          <Button
            type="submit"
            className="h-11 bg-navy px-6 text-white hover:bg-[#0a2350]"
          >
            Continue →
          </Button>
        </div>
      </ScrollReveal>
    </form>
  )
}
