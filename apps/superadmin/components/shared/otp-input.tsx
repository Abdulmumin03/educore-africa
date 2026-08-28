"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const LENGTH = 6

/**
 * Six single-digit boxes that behave like one field: typing advances,
 * backspace on an empty box steps back, and a pasted code fills the row.
 *
 * The value is mirrored into a hidden input so the surrounding <form> submits
 * it like any other named field.
 */
export function OtpInput({
  name = "otp",
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
}: {
  name?: string
  value: string
  onChange: (next: string) => void
  onComplete?: (code: string) => void
  disabled?: boolean
  autoFocus?: boolean
}) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([])
  const digits = value.padEnd(LENGTH, " ").slice(0, LENGTH).split("")

  const commit = (next: string) => {
    const cleaned = next.replace(/\D/g, "").slice(0, LENGTH)
    onChange(cleaned)
    if (cleaned.length === LENGTH) onComplete?.(cleaned)
  }

  const focus = (index: number) => {
    refs.current[Math.max(0, Math.min(LENGTH - 1, index))]?.focus()
  }

  const handleChange = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "")
    if (!typed) return

    // Multiple characters means a paste (or an autofilled SMS-style code).
    if (typed.length > 1) {
      commit(typed)
      focus(typed.length)
      return
    }

    const chars = value.padEnd(LENGTH, " ").split("")
    chars[index] = typed
    commit(chars.join("").replace(/\s+$/, "").replace(/\s/g, ""))
    focus(index + 1)
  }

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault()
      const chars = value.padEnd(LENGTH, " ").split("")

      if (chars[index] && chars[index] !== " ") {
        chars[index] = " "
        commit(chars.join("").replace(/\s/g, ""))
        return
      }

      // Empty box — clear the previous one and step back.
      if (index > 0) {
        chars[index - 1] = " "
        commit(chars.join("").replace(/\s/g, ""))
        focus(index - 1)
      }
      return
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault()
      focus(index - 1)
    }
    if (event.key === "ArrowRight") {
      event.preventDefault()
      focus(index + 1)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <input type="hidden" name={name} value={value} />

      {Array.from({ length: LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            refs.current[index] = element
          }}
          value={digits[index] === " " ? "" : digits[index]}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1}`}
          className={cn(
            "h-12 w-11 rounded-md border border-input bg-background text-center text-lg font-medium tabular-nums",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      ))}
    </div>
  )
}
