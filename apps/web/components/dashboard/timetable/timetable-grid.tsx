"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export type Slot = {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  room: string | null
  subject: { id: string; name: string; code: string }
  teacher: { id: string; firstName: string; lastName: string; initials: string }
  class: { id: string; name: string }
  section: { id: string; name: string }
}

type Period = { startTime: string; endTime: string }

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function subjectColour(id: string): { bg: string; ring: string; text: string } {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  const hue = h % 360
  return {
    bg: `hsl(${hue} 70% 92%)`,
    ring: `hsl(${hue} 60% 60%)`,
    text: `hsl(${hue} 50% 25%)`,
  }
}

export function TimetableGrid({
  days,
  periods,
  slots,
  conflictSlotIds,
  showSectionLabel = false,
  editable = false,
  onCellClick,
  onSwap,
}: {
  days: number[]
  periods: Period[]
  slots: Slot[]
  conflictSlotIds?: Set<string>
  showSectionLabel?: boolean
  editable?: boolean
  onCellClick?: (slot: Slot | null, period: Period, day: number) => void
  onSwap?: (idA: string, idB: string) => void
}) {
  const [dragSlotId, setDragSlotId] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const cellMap = useMemo(() => {
    const m = new Map<string, Slot[]>()
    for (const s of slots) {
      const key = `${s.dayOfWeek}-${s.startTime}`
      const list = m.get(key) ?? []
      list.push(s)
      m.set(key, list)
    }
    return m
  }, [slots])

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="w-20 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
              Period
            </th>
            {days.map((d) => (
              <th
                key={d}
                className="px-2 py-2 text-left text-xs font-medium text-muted-foreground"
              >
                {DAY_LABELS[d] ?? `Day ${d}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.startTime} className="border-b last:border-b-0">
              <td className="px-2 py-2 align-top">
                <div className="text-xs font-semibold">{p.startTime}</div>
                <div className="text-[10px] text-muted-foreground">{p.endTime}</div>
              </td>
              {days.map((d) => {
                const cellSlots = cellMap.get(`${d}-${p.startTime}`) ?? []
                const cellKey = `${d}-${p.startTime}`
                const isDropTarget = dragOverKey === cellKey && dragSlotId !== null
                return (
                  <td
                    key={d}
                    className={cn(
                      "px-1 py-1 align-top",
                      isDropTarget && "bg-primary/10",
                    )}
                    onDragOver={(e) => {
                      if (!editable || !onSwap || !dragSlotId) return
                      e.preventDefault()
                      setDragOverKey(cellKey)
                    }}
                    onDragLeave={() => {
                      if (dragOverKey === cellKey) setDragOverKey(null)
                    }}
                    onDrop={(e) => {
                      if (!editable || !onSwap || !dragSlotId) return
                      e.preventDefault()
                      const target = cellSlots[0]
                      if (target && target.id !== dragSlotId) {
                        onSwap(dragSlotId, target.id)
                      }
                      setDragSlotId(null)
                      setDragOverKey(null)
                    }}
                  >
                    {cellSlots.length === 0 ? (
                      <EmptyCell
                        editable={editable}
                        onClick={() => onCellClick?.(null, p, d)}
                      />
                    ) : (
                      <div className="space-y-1">
                        {cellSlots.map((s) => (
                          <SlotCell
                            key={s.id}
                            slot={s}
                            showSection={showSectionLabel}
                            conflict={conflictSlotIds?.has(s.id) ?? false}
                            editable={editable}
                            dragging={dragSlotId === s.id}
                            onClick={() => onCellClick?.(s, p, d)}
                            onDragStart={() => setDragSlotId(s.id)}
                            onDragEnd={() => {
                              setDragSlotId(null)
                              setDragOverKey(null)
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyCell({
  editable,
  onClick,
}: {
  editable: boolean
  onClick: () => void
}) {
  if (!editable) {
    return <div className="h-full min-h-12 rounded bg-muted/30" aria-hidden />
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-h-12 w-full items-center justify-center rounded border border-dashed border-muted-foreground/30 text-muted-foreground/60 hover:bg-muted/40 hover:text-foreground"
      aria-label="Add slot"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  )
}

function SlotCell({
  slot,
  showSection,
  conflict,
  editable,
  dragging,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  slot: Slot
  showSection: boolean
  conflict: boolean
  editable: boolean
  dragging: boolean
  onClick: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const c = subjectColour(slot.subject.id)
  const Inner = (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5 text-xs leading-tight shadow-sm",
        conflict && "ring-2 ring-red-500 ring-offset-1",
        dragging && "opacity-50",
        editable && "cursor-grab active:cursor-grabbing",
      )}
      style={{ backgroundColor: c.bg, borderColor: c.ring, color: c.text }}
      title={
        (conflict ? "⚠ Teacher double-booked at this time. " : "") +
        `${slot.subject.name} · ${slot.teacher.firstName} ${slot.teacher.lastName}${slot.room ? ` · ${slot.room}` : ""}`
      }
    >
      <div className="flex items-start justify-between gap-1">
        <div className="truncate font-semibold">{slot.subject.name}</div>
        {conflict && <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" />}
      </div>
      <div className="flex items-center justify-between gap-1 opacity-80">
        <span className="truncate">{slot.teacher.initials}</span>
        {slot.room && <span className="shrink-0">· {slot.room}</span>}
      </div>
      {showSection && (
        <div className="truncate text-[10px] opacity-70">
          {slot.class.name} · Arm {slot.section.name}
        </div>
      )}
    </div>
  )

  if (!editable) return Inner

  return (
    <button
      type="button"
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="w-full text-left"
    >
      {Inner}
    </button>
  )
}
