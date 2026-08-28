import ExcelJS from "exceljs"
import { jsPDF } from "jspdf"
import Papa from "papaparse"

// Every console table can be exported. These helpers return raw bytes so the
// caller decides between a route handler Response and a server action.

export type Row = Record<string, string | number | boolean | null | undefined>

export function toCsv(rows: Row[]): string {
  return Papa.unparse(rows, { header: true })
}

export function csvResponse(rows: Row[], filename: string): Response {
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  })
}

export async function toExcel(rows: Row[], sheetName = "Export"): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "EduCore Africa Console"
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(sheetName)
  const columns = Object.keys(rows[0] ?? {})

  sheet.columns = columns.map((key) => ({
    header: key,
    key,
    width: Math.min(Math.max(key.length + 4, 12), 40),
  }))
  sheet.getRow(1).font = { bold: true }
  rows.forEach((row) => sheet.addRow(row))
  sheet.views = [{ state: "frozen", ySplit: 1 }]

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export async function excelResponse(rows: Row[], filename: string): Promise<Response> {
  const buffer = await toExcel(rows, filename)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  })
}

/**
 * Minimal tabular PDF — enough for board packs and ad-hoc exports. Anything
 * with real layout requirements should get its own renderer.
 */
export function toPdf(opts: { title: string; rows: Row[]; subtitle?: string }): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
  const columns = Object.keys(opts.rows[0] ?? {})
  const marginX = 40
  let y = 48

  doc.setFontSize(16)
  doc.text(opts.title, marginX, y)
  y += 18

  if (opts.subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(opts.subtitle, marginX, y)
    doc.setTextColor(0)
    y += 16
  }

  const pageWidth = doc.internal.pageSize.getWidth()
  const colWidth = columns.length ? (pageWidth - marginX * 2) / columns.length : 0

  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  columns.forEach((col, i) => doc.text(String(col), marginX + i * colWidth, y))
  doc.setFont("helvetica", "normal")
  y += 14

  for (const row of opts.rows) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      y = 48
    }
    columns.forEach((col, i) => {
      const value = row[col]
      doc.text(String(value ?? ""), marginX + i * colWidth, y, { maxWidth: colWidth - 6 })
    })
    y += 14
  }

  return Buffer.from(doc.output("arraybuffer"))
}

export function pdfResponse(opts: { title: string; rows: Row[]; subtitle?: string; filename: string }): Response {
  const buffer = toPdf(opts)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${opts.filename}.pdf"`,
    },
  })
}
