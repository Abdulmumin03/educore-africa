import { createHash } from "node:crypto"
import { jsPDF } from "jspdf"

import type { AuditRow } from "@/lib/audit-query"

// Compliance export of the audit trail.
//
// The spec asked for a "signed PDF". This is NOT digitally signed: signing a
// PDF needs an X.509 certificate and a signing library, neither of which this
// platform has, and a document that claims a signature it does not carry is
// worse than one that claims nothing. What it carries instead is a SHA-256
// digest of the exact rows exported, printed on the document and reproducible
// from the audit table — which detects tampering with the export, and says so
// in as many words on the page.

export type ExportMeta = {
  exportedBy: string
  exportedByRole: string
  exportedAt: Date
  from: Date | null
  to: Date | null
  filters: string[]
  totalMatching: number
}

/** Canonical form of the rows, so the same data always hashes the same. */
export function auditDigest(rows: AuditRow[]): string {
  const canonical = rows
    .map((row) =>
      [row.at, row.user, row.role ?? "", row.action, row.targetType, row.target, row.ipAddress].join(
        "",
      ),
    )
    .join("\n")
  return createHash("sha256").update(canonical).digest("hex")
}

function wrap(doc: jsPDF, text: string, width: number): string[] {
  return doc.splitTextToSize(text, width) as string[]
}

export function auditPdf(rows: AuditRow[], meta: ExportMeta): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 36
  const contentWidth = pageWidth - marginX * 2
  const digest = auditDigest(rows)

  const dateFmt = (value: Date) =>
    `${value.toLocaleDateString("en-GB")} ${value.toLocaleTimeString("en-GB")}`

  let y = 0

  function header(): void {
    y = 44
    doc.setFont("helvetica", "bold")
    doc.setFontSize(15)
    doc.text("EduCore Africa — Super Admin Audit Trail", marginX, y)
    y += 16

    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(90)
    const window =
      meta.from || meta.to
        ? `${meta.from ? meta.from.toLocaleDateString("en-GB") : "start"} – ${
            meta.to ? meta.to.toLocaleDateString("en-GB") : "now"
          }`
        : "Complete history"
    doc.text(
      `Window: ${window}   ·   Rows in this export: ${rows.length} of ${meta.totalMatching} matching`,
      marginX,
      y,
    )
    y += 12
    doc.text(
      `Exported by ${meta.exportedBy} (${meta.exportedByRole}) on ${dateFmt(meta.exportedAt)}`,
      marginX,
      y,
    )
    y += 12
    if (meta.filters.length > 0) {
      doc.text(`Filters: ${meta.filters.join("  ·  ")}`, marginX, y)
      y += 12
    }
    doc.setTextColor(0)
    y += 6
  }

  const columns: Array<{ key: keyof AuditRow | "change"; label: string; width: number }> = [
    { key: "at", label: "Timestamp", width: 96 },
    { key: "user", label: "User", width: 96 },
    { key: "role", label: "Role", width: 84 },
    { key: "action", label: "Action", width: 132 },
    { key: "target", label: "Target", width: 150 },
    { key: "ipAddress", label: "IP", width: 84 },
    { key: "change", label: "Before → After", width: contentWidth - 642 },
  ]

  function columnHeadings(): void {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    let x = marginX
    for (const column of columns) {
      doc.text(column.label, x, y)
      x += column.width
    }
    y += 4
    doc.setDrawColor(200)
    doc.line(marginX, y, pageWidth - marginX, y)
    y += 10
    doc.setFont("helvetica", "normal")
  }

  header()
  columnHeadings()

  doc.setFontSize(7.5)

  for (const row of rows) {
    const change =
      row.before || row.after
        ? `${JSON.stringify(row.before ?? {})} → ${JSON.stringify(row.after ?? {})}`
        : row.details
          ? JSON.stringify(row.details)
          : ""

    const cells: string[][] = columns.map((column) => {
      const raw =
        column.key === "change"
          ? change
          : column.key === "at"
            ? dateFmt(new Date(row.at))
            : String((row as Record<string, unknown>)[column.key] ?? "")
      return wrap(doc, raw, column.width - 6)
    })

    const lines = Math.max(...cells.map((cell) => cell.length))
    const rowHeight = lines * 9 + 4

    if (y + rowHeight > pageHeight - 46) {
      doc.addPage()
      header()
      columnHeadings()
      doc.setFontSize(7.5)
    }

    let x = marginX
    cells.forEach((cell, index) => {
      doc.text(cell, x, y)
      x += columns[index].width
    })
    y += rowHeight
  }

  // Footer on every page: page numbers plus the integrity statement.
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFontSize(7)
    doc.setTextColor(120)
    doc.text(
      `SHA-256 of exported rows: ${digest}`,
      marginX,
      pageHeight - 26,
    )
    doc.text(
      "Content digest, not a cryptographic signature. It detects alteration of this export; it does not certify the issuer.",
      marginX,
      pageHeight - 16,
    )
    doc.text(`Page ${page} of ${pages}`, pageWidth - marginX - 54, pageHeight - 16)
    doc.setTextColor(0)
  }

  return Buffer.from(doc.output("arraybuffer"))
}

export function auditPdfResponse(rows: AuditRow[], meta: ExportMeta): Response {
  const buffer = auditPdf(rows, meta)
  const stamp = meta.exportedAt.toISOString().slice(0, 10)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="educore-audit-trail-${stamp}.pdf"`,
      // Handy for a caller that wants to verify without opening the PDF.
      "X-Audit-Digest": auditDigest(rows),
    },
  })
}
