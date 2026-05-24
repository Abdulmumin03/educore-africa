"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

type Effect = "up" | "fade" | "scale"

const hidden: Record<Effect, string> = {
  up: "translate-y-6 opacity-0",
  fade: "opacity-0",
  scale: "scale-[0.97] opacity-0",
}

const shown = "translate-y-0 scale-100 opacity-100"

export function ScrollReveal({
  children,
  delay = 0,
  effect = "up",
  className = "",
  duration = 700,
}: {
  children: ReactNode
  delay?: number
  effect?: Effect
  className?: string
  duration?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof window === "undefined") return

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true)
      return
    }

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: delay ? `${delay}ms` : undefined,
      }}
      className={`transition-all ease-out will-change-transform ${
        visible ? shown : hidden[effect]
      } ${className}`}
    >
      {children}
    </div>
  )
}
