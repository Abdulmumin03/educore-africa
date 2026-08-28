import ExcelJS from "exceljs"
import Papa from "papaparse"

import type { FieldType } from "@/lib/reports"

// Styled export for the report builder.
//
// lib/exports.ts stays as it is — a thin CSV/Excel/PDF helper for ad-hoc table
// dumps. This module is the presentation-grade one: it knows the column TYPES,
// so naira are naira, dates are DD/MM/YYYY, and a spreadsheet opens ready to
// filter rather than as a wall of strings.

export type Column = { key: string; label: string; type: FieldType }
export type Row = Record<string, unknown>

const NAVY = "FF0A1628"
const HEADER_TEXT = "FFF8FAFC"
const STRIPE = "FFF1F5F9"
const BORDER = "FFCBD5E1"

/** Excel number formats. Naira renders with the symbol Windows and Mac agree on. */
const FORMAT: Partial<Record<FieldType, string>> = {
  currency: '"₦"#,##0',
  number: "#,##0",
  date: "dd/mm/yyyy",
}

/** Column width in characters, clamped to roughly 80–300 CSS pixels. */
const MIN_CHARS = 11
const MAX_CHARS = 42

function coerce(value: unknown, type: FieldType): string | number | Date | boolean | null {
  if (value === null || value === undefined) return null

  switch (type) {
    case "currency":
    case "number": {
      const numeric = typeof value === "number" ? value : Number(value)
      return Number.isFinite(numeric) ? numeric : null
    }
    case "date": {
      const date = value instanceof Date ? value : new Date(String(value))
      return Number.isNaN(date.getTime()) ? null : date
    }
    case "boolean":
      // Written as words, not TRUE/FALSE: the column reads as data, and a
      // spreadsheet filter on "Yes" is what somebody will actually reach for.
      return value ? "Yes" : "No"
    default:
      return String(value)
  }
}

export async function buildWorkbook(input: {
  title: string
  columns: Column[]
  rows: Row[]
  /** Shown under the title on the metadata sheet. */
  subtitle?: string
  filters?: string[]
  generatedBy?: string
  /** Set when the query matched more rows than the file contains. */
  truncatedFrom?: number | null
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "EduCore Africa Super Admin Console"
  workbook.created = new Date()

  // ── Data sheet ─────────────────────────────────────────────────────────
  const sheet = workbook.addWorksheet("Data", {
    views: [{ state: "frozen", ySplit: 1 }],
  })

  sheet.columns = input.columns.map((column) => ({
    header: column.label,
    key: column.key,
    style: FORMAT[column.type] ? { numFmt: FORMAT[column.type] } : undefined,
  }))

  for (const row of input.rows) {
    sheet.addRow(
      Object.fromEntries(
        input.columns.map((column) => [column.key, coerce(row[column.key], column.type)]),
      ),
    )
  }

  const header = sheet.getRow(1)
  header.height = 22
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 11 }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }
    cell.alignment = { vertical: "middle", horizontal: "left" }
    cell.border = { bottom: { style: "thin", color: { argb: BORDER } } }
  })

  // Stripes start at row 2 so the header is never one of them.
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index)
    if (index % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } }
      })
    }
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: BORDER } } }
    })
  }

  // Width from the widest cell actually present, not from the header alone.
  input.columns.forEach((column, index) => {
    const sheetColumn = sheet.getColumn(index + 1)
    let widest = column.label.length
    sheetColumn.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value
      const text =
        value instanceof Date
          ? "dd/mm/yyyy"
          : typeof value === "number"
            ? Math.round(value).toLocaleString("en-NG")
            : String(value ?? "")
      if (text.length > widest) widest = text.length
    })
    sheetColumn.width = Math.min(MAX_CHARS, Math.max(MIN_CHARS, widest + 2))
    if (column.type === "currency" || column.type === "number") {
      sheetColumn.alignment = { horizontal: "right" }
    }
  })

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: input.columns.length },
  }

  // ── Metadata sheet ─────────────────────────────────────────────────────
  // A spreadsheet that leaves its own provenance out gets forwarded and then
  // argued about. This one carries what it is and what it excluded.
  const about = workbook.addWorksheet("About")
  about.columns = [
    { key: "k", width: 22 },
    { key: "v", width: 74 },
  ]

  const meta: Array<[string, string]> = [
    ["Report", input.title],
    ...(input.subtitle ? ([["Description", input.subtitle]] as Array<[string, string]>) : []),
    ["Generated", new Date().toLocaleString("en-GB")],
    ...(input.generatedBy ? ([["Generated by", input.generatedBy]] as Array<[string, string]>) : []),
    ["Rows in this file", String(input.rows.length)],
    ...(input.truncatedFrom
      ? ([
          [
            "TRUNCATED",
            `The query matched ${input.truncatedFrom.toLocaleString("en-NG")} rows; this file holds the first ${input.rows.length.toLocaleString("en-NG")}.`,
          ],
        ] as Array<[string, string]>)
      : []),
    ["Filters", input.filters?.length ? input.filters.join("  ·  ") : "None"],
    ["Source", "EduCore Africa Super Admin Console"],
    ["Confidentiality", "Internal — contains cross-tenant data. Do not forward outside EduCore."],
  ]

  for (const [key, value] of meta) {
    const row = about.addRow({ k: key, v: value })
    row.getCell(1).font = { bold: true, size: 10 }
    row.getCell(2).font = { size: 10 }
    row.getCell(2).alignment = { wrapText: true, vertical: "top" }
    if (key === "TRUNCATED") {
      row.getCell(1).font = { bold: true, size: 10, color: { argb: "FFB91C1C" } }
      row.getCell(2).font = { size: 10, color: { argb: "FFB91C1C" } }
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export function buildCsv(columns: Column[], rows: Row[]): string {
  return Papa.unparse(
    rows.map((row) =>
      Object.fromEntries(
        columns.map((column) => {
          const value = coerce(row[column.key], column.type)
          return [
            column.label,
            value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? ""),
          ]
        }),
      ),
    ),
    { header: true },
  )
}

// ── PDF ──────────────────────────────────────────────────────────────────────

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
})

function cellText(value: unknown, type: FieldType): string {
  if (value === null || value === undefined || value === "") return "—"
  switch (type) {
    case "currency":
      return naira.format(Number(value) || 0)
    case "number":
      return Number(value).toLocaleString("en-NG")
    case "date": {
      const date = new Date(String(value))
      return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB")
    }
    case "boolean":
      return value ? "Yes" : "No"
    default:
      return String(value)
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * The print template.
 *
 * Deliberately LIGHT even though the console is dark: a dark PDF drinks a
 * cartridge and photocopies as a black rectangle. It is the same information
 * in the medium's own idiom, not a screenshot of the screen.
 */
export function reportHtml(input: {
  title: string
  subtitle?: string
  columns: Column[]
  rows: Row[]
  filters?: string[]
  generatedBy?: string
  truncatedFrom?: number | null
}): string {
  const head = input.columns
    .map(
      (column) =>
        `<th class="${column.type === "currency" || column.type === "number" ? "num" : ""}">${escapeHtml(column.label)}</th>`,
    )
    .join("")

  const body = input.rows
    .map(
      (row) =>
        "<tr>" +
        input.columns
          .map(
            (column) =>
              `<td class="${column.type === "currency" || column.type === "number" ? "num" : ""}">${escapeHtml(cellText(row[column.key], column.type))}</td>`,
          )
          .join("") +
        "</tr>",
    )
    .join("")

  const filters = input.filters?.length
    ? input.filters.map((f) => `<li>${escapeHtml(f)}</li>`).join("")
    : "<li>None — every row in the source</li>"

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 14mm 12mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Inter, Helvetica, Arial, sans-serif;
         color: #0A1628; font-size: 9.5pt; line-height: 1.45; }

  .cover { height: 178mm; display: flex; flex-direction: column; justify-content: center;
           page-break-after: always; }
  .mark { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; }
  .mark span { font-size: 15pt; font-weight: 700; letter-spacing: -.01em; }
  h1 { margin: 0 0 6px; font-size: 30pt; font-weight: 700; letter-spacing: -.02em; line-height: 1.1; }
  .sub { font-size: 12pt; color: #475569; margin: 0 0 30px; max-width: 150mm; }
  .facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 34px;
           max-width: 150mm; border-top: 2px solid #0A1628; padding-top: 16px; }
  .facts dt { font-size: 8pt; text-transform: uppercase; letter-spacing: .07em; color: #64748B; }
  .facts dd { margin: 1px 0 0; font-size: 11pt; font-weight: 600; }
  .facts ul { margin: 3px 0 0; padding-left: 15px; font-size: 9.5pt; font-weight: 400; }

  .warn { margin-top: 22px; padding: 9px 12px; border-left: 3px solid #B91C1C;
          background: #FEF2F2; color: #7F1D1D; font-size: 9pt; max-width: 150mm; }
  .conf { margin-top: 22px; font-size: 8.5pt; color: #64748B; max-width: 150mm; }

  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #0A1628; color: #F8FAFC; font-size: 8pt; font-weight: 600;
       text-transform: uppercase; letter-spacing: .04em; text-align: left;
       padding: 6px 7px; }
  td { padding: 5px 7px; border-bottom: 0.5pt solid #E2E8F0; font-size: 8.5pt; }
  tr:nth-child(even) td { background: #F8FAFC; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>

<section class="cover">
  <div class="mark">
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0A1628" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5"/>
    </svg>
    <span>EduCore Africa</span>
  </div>

  <h1>${escapeHtml(input.title)}</h1>
  ${input.subtitle ? `<p class="sub">${escapeHtml(input.subtitle)}</p>` : ""}

  <dl class="facts">
    <div><dt>Generated</dt><dd>${new Date().toLocaleString("en-GB")}</dd></div>
    <div><dt>Rows</dt><dd>${input.rows.length.toLocaleString("en-NG")}</dd></div>
    ${input.generatedBy ? `<div><dt>Generated by</dt><dd>${escapeHtml(input.generatedBy)}</dd></div>` : ""}
    <div><dt>Columns</dt><dd>${input.columns.length}</dd></div>
    <div style="grid-column: 1 / -1"><dt>Filters</dt><dd><ul>${filters}</ul></dd></div>
  </dl>

  ${
    input.truncatedFrom
      ? `<p class="warn"><strong>This report is truncated.</strong> The query matched
         ${input.truncatedFrom.toLocaleString("en-NG")} rows; the pages that follow hold the first
         ${input.rows.length.toLocaleString("en-NG")}. Narrow the filters for a complete picture.</p>`
      : ""
  }

  <p class="conf">Confidential — EduCore Africa internal. Contains data from multiple tenant
  schools. Do not forward outside the organisation.</p>
</section>

<table>
  <thead><tr>${head}</tr></thead>
  <tbody>${body}</tbody>
</table>

</body>
</html>`
}

export type PdfResult =
  | { ok: true; buffer: Buffer; renderer: "chromium" }
  | { ok: false; reason: string; html: string }

/**
 * Render the template to PDF with headless Chromium.
 *
 * Playwright is a dev dependency here and the browser is NOT in the production
 * image, so this is imported dynamically and returns `ok: false` with the HTML
 * when it cannot run. The caller then serves the HTML (which prints correctly
 * from a browser) rather than a broken download — the alternative is a 400 MB
 * image for a feature most operators reach for once a month.
 */
export async function renderPdf(html: string): Promise<PdfResult> {
  let chromium: typeof import("@playwright/test").chromium
  try {
    ;({ chromium } = await import("@playwright/test"))
  } catch {
    return {
      ok: false,
      reason:
        "PDF rendering needs headless Chromium, which is not installed in this environment. The report is available as HTML below, and as Excel or CSV from the same menu.",
      html,
    }
  }

  try {
    const browser = await chromium.launch({
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    })
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: "load" })
      const buffer = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "14mm", bottom: "18mm", left: "12mm", right: "12mm" },
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: `<div style="width:100%;font-size:7pt;color:#64748B;
          font-family:'Segoe UI',Arial,sans-serif;padding:0 12mm;display:flex;
          justify-content:space-between">
          <span>Confidential — EduCore Africa Internal</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
      })
      return { ok: true, buffer: Buffer.from(buffer), renderer: "chromium" }
    } finally {
      await browser.close()
    }
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `Chromium could not render the PDF: ${error.message.slice(0, 160)}`
          : "Chromium could not render the PDF.",
      html,
    }
  }
}
