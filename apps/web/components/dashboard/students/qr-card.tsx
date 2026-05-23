"use client"

import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { studentQrPayload } from "@/lib/qr"

export type QrCardStudent = {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string
  className: string | null
  sectionName: string | null
  avatarUrl: string | null
}

/**
 * A single printable ID card with embedded QR code. QR encodes
 * `educore:student:<id>` which the qr-checkin endpoint decodes.
 *
 * Layout is fixed-width so a 2-column print sheet fits ~10 per page.
 */
export function StudentQrCard({
  student,
  schoolName,
  schoolLogoUrl,
  schoolMotto,
}: {
  student: QrCardStudent
  schoolName: string
  schoolLogoUrl?: string | null
  schoolMotto?: string | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    QRCode.toCanvas(canvas, studentQrPayload(student.id), {
      width: 140,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "QR generation failed")
    })
  }, [student.id])

  const initials = (student.firstName[0] ?? "") + (student.lastName[0] ?? "")

  return (
    <div className="w-[320px] shrink-0 break-inside-avoid overflow-hidden rounded-lg border bg-white text-gray-900 shadow-sm print:shadow-none">
      <div className="flex items-center gap-2 border-b bg-[#0D2B5E] px-3 py-2 text-white">
        {schoolLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={schoolLogoUrl} alt="" className="h-6 w-6 rounded bg-white object-contain" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold uppercase tracking-wide">{schoolName}</p>
          {schoolMotto && (
            <p className="truncate text-[9px] italic opacity-80">{schoolMotto}</p>
          )}
        </div>
        <span className="rounded bg-white/15 px-1.5 py-0.5 text-[9px] uppercase">Student ID</span>
      </div>
      <div className="flex gap-3 p-3">
        <div className="flex flex-col items-center gap-2">
          <div className="h-20 w-20 overflow-hidden rounded-full border bg-gray-100">
            {student.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={student.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-lg font-bold text-gray-500">
                {initials}
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="h-[100px] w-[100px]" />
          {error && <p className="max-w-[100px] text-[8px] text-red-600">{error}</p>}
        </div>
        <div className="flex-1 space-y-1.5 text-xs">
          <p className="text-[10px] uppercase text-gray-500">Name</p>
          <p className="text-sm font-bold leading-tight">
            {student.firstName} {student.lastName}
          </p>
          <p className="text-[10px] uppercase text-gray-500">Admission no.</p>
          <p className="font-mono text-sm font-semibold">{student.admissionNumber}</p>
          {student.className && (
            <>
              <p className="text-[10px] uppercase text-gray-500">Class</p>
              <p>
                {student.className}
                {student.sectionName ? ` · Arm ${student.sectionName}` : ""}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="border-t bg-gray-50 px-3 py-1.5 text-center text-[9px] text-gray-500">
        Scan this code to check in at school
      </div>
    </div>
  )
}
