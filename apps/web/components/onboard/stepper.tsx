import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type Step = { key: string; title: string }

export function Stepper({
  steps,
  currentIndex,
}: {
  steps: Step[]
  currentIndex: number
}) {
  const pct = ((currentIndex + 1) / steps.length) * 100
  return (
    <div className="w-full">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {steps.map((step, i) => {
          const done = i < currentIndex
          const active = i === currentIndex
          return (
            <li
              key={step.key}
              className={cn(
                "flex items-start gap-2 rounded-md border p-3 text-sm",
                active && "border-primary bg-primary/5",
                done && "border-emerald-500/40 bg-emerald-500/5 text-emerald-700",
                !active && !done && "border-muted text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium",
                  active && "border-primary bg-primary text-primary-foreground",
                  done && "border-emerald-500 bg-emerald-500 text-white",
                  !active && !done && "border-muted-foreground/40",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <div className="leading-tight">
                <div className="font-medium text-foreground">{step.title}</div>
                <div className="text-xs text-muted-foreground">Step {i + 1}</div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
