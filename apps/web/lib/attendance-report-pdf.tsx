import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#0f172a", fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1pt solid #cbd5e1",
    paddingBottom: 12,
    marginBottom: 12,
  },
  schoolName: { fontSize: 16, fontWeight: 700, color: "#0D2B5E" },
  schoolMeta: { fontSize: 9, color: "#475569", marginTop: 2 },
  title: { fontSize: 13, fontWeight: 700, marginTop: 4 },
  meta: { fontSize: 9, color: "#475569" },
  table: {
    marginTop: 10,
    borderTop: "0.5pt solid #cbd5e1",
    borderBottom: "0.5pt solid #cbd5e1",
  },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.25pt solid #e2e8f0" },
  trHead: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottom: "0.5pt solid #cbd5e1",
    fontWeight: 700,
    backgroundColor: "#f1f5f9",
  },
  cellNo: { width: 28, fontSize: 9 },
  cellName: { flex: 2, fontSize: 9 },
  cellAdm: { flex: 1, fontSize: 9, color: "#475569" },
  cellNum: { flex: 1, fontSize: 9, textAlign: "right" },
  totals: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalsCard: {
    flex: 1,
    padding: 8,
    border: "0.5pt solid #cbd5e1",
    marginHorizontal: 4,
  },
  totalsLabel: { fontSize: 9, color: "#475569", textTransform: "uppercase" },
  totalsValue: { fontSize: 14, fontWeight: 700, marginTop: 2 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#94a3b8",
    borderTop: "0.5pt solid #cbd5e1",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
})

type SchoolHeader = {
  name: string
  address?: string | null
  phone?: string | null
  email?: string | null
}

function dateOnly(iso: string) {
  return new Date(iso).toISOString().slice(0, 10)
}

// ─── Class report ─────────────────────────────────────────────────

export type ClassReportPdfInput = {
  school: SchoolHeader
  section: { name: string; className: string }
  from: string | null
  to: string | null
  rows: Array<{
    studentId: string
    admissionNumber: string
    firstName: string
    lastName: string
    present: number
    absent: number
    late: number
    excused: number
    totalDays: number
    percent: number | null
  }>
  generatedAt: string
}

function summarize(rows: ClassReportPdfInput["rows"]) {
  let p = 0, a = 0, l = 0, e = 0, t = 0
  for (const r of rows) {
    p += r.present
    a += r.absent
    l += r.late
    e += r.excused
    t += r.totalDays
  }
  const pct = t === 0 ? null : Math.round(((p + l * 0.5) / t) * 100)
  return { p, a, l, e, t, pct }
}

export function ClassReportDocument({ data }: { data: ClassReportPdfInput }) {
  const sum = summarize(data.rows)
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header
          school={data.school}
          title="Class attendance report"
          meta={
            <Text style={styles.meta}>
              {data.section.className} · Arm {data.section.name}
              {data.from ? ` · ${dateOnly(data.from)} → ${dateOnly(data.to ?? data.from)}` : ""}
            </Text>
          }
          generatedAt={data.generatedAt}
        />

        <View style={styles.totals}>
          <TotalCard label="Average %" value={sum.pct === null ? "—" : `${sum.pct}%`} />
          <TotalCard label="Present" value={String(sum.p)} />
          <TotalCard label="Late" value={String(sum.l)} />
          <TotalCard label="Absent" value={String(sum.a)} />
          <TotalCard label="Excused" value={String(sum.e)} />
        </View>

        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={styles.cellNo}>#</Text>
            <Text style={styles.cellName}>Student</Text>
            <Text style={styles.cellAdm}>Adm. no.</Text>
            <Text style={styles.cellNum}>P</Text>
            <Text style={styles.cellNum}>L</Text>
            <Text style={styles.cellNum}>A</Text>
            <Text style={styles.cellNum}>E</Text>
            <Text style={styles.cellNum}>%</Text>
          </View>
          {data.rows.map((r, i) => (
            <View key={r.studentId} style={styles.tr}>
              <Text style={styles.cellNo}>{i + 1}</Text>
              <Text style={styles.cellName}>
                {r.firstName} {r.lastName}
              </Text>
              <Text style={styles.cellAdm}>{r.admissionNumber}</Text>
              <Text style={styles.cellNum}>{r.present}</Text>
              <Text style={styles.cellNum}>{r.late}</Text>
              <Text style={styles.cellNum}>{r.absent}</Text>
              <Text style={styles.cellNum}>{r.excused}</Text>
              <Text style={styles.cellNum}>{r.percent === null ? "—" : `${r.percent}%`}</Text>
            </View>
          ))}
        </View>

        <Footer schoolName={data.school.name} />
      </Page>
    </Document>
  )
}

// ─── Student report ───────────────────────────────────────────────

export type StudentReportPdfInput = {
  school: SchoolHeader
  student: { name: string; admissionNumber: string; className: string | null; sectionName: string | null }
  from: string | null
  to: string | null
  summary: { PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number; totalDays: number; percent: number | null }
  items: Array<{ date: string; status: string; remark: string | null }>
  generatedAt: string
}

export function StudentReportDocument({ data }: { data: StudentReportPdfInput }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header
          school={data.school}
          title="Student attendance report"
          meta={
            <View>
              <Text style={styles.meta}>
                {data.student.name} · {data.student.admissionNumber}
              </Text>
              {(data.student.className || data.student.sectionName) && (
                <Text style={styles.meta}>
                  {data.student.className ?? ""}
                  {data.student.sectionName ? ` · Arm ${data.student.sectionName}` : ""}
                </Text>
              )}
              {data.from && (
                <Text style={styles.meta}>
                  {dateOnly(data.from)} → {dateOnly(data.to ?? data.from)}
                </Text>
              )}
            </View>
          }
          generatedAt={data.generatedAt}
        />

        <View style={styles.totals}>
          <TotalCard
            label="Attendance"
            value={data.summary.percent === null ? "—" : `${data.summary.percent}%`}
          />
          <TotalCard label="Present" value={String(data.summary.PRESENT)} />
          <TotalCard label="Late" value={String(data.summary.LATE)} />
          <TotalCard label="Absent" value={String(data.summary.ABSENT)} />
          <TotalCard label="Excused" value={String(data.summary.EXCUSED)} />
        </View>

        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={[styles.cellName, { flex: 1 }]}>Date</Text>
            <Text style={[styles.cellName, { flex: 1 }]}>Status</Text>
            <Text style={[styles.cellName, { flex: 2 }]}>Remark</Text>
          </View>
          {data.items.slice(0, 200).map((r, i) => (
            <View key={i} style={styles.tr}>
              <Text style={[styles.cellName, { flex: 1 }]}>{r.date}</Text>
              <Text style={[styles.cellName, { flex: 1 }]}>{r.status}</Text>
              <Text style={[styles.cellName, { flex: 2, color: "#475569" }]}>
                {r.remark ?? "—"}
              </Text>
            </View>
          ))}
        </View>

        <Footer schoolName={data.school.name} />
      </Page>
    </Document>
  )
}

// ─── Shared bits ──────────────────────────────────────────────────

function Header({
  school,
  title,
  meta,
  generatedAt,
}: {
  school: SchoolHeader
  title: string
  meta?: React.ReactNode
  generatedAt: string
}) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.schoolName}>{school.name}</Text>
        <Text style={styles.schoolMeta}>
          {[school.address, school.phone, school.email].filter(Boolean).join(" · ")}
        </Text>
        <Text style={styles.title}>{title}</Text>
        {meta}
      </View>
      <View>
        <Text style={[styles.meta, { textAlign: "right" }]}>Issued</Text>
        <Text style={[styles.title, { fontSize: 10, textAlign: "right" }]}>
          {dateOnly(generatedAt)}
        </Text>
      </View>
    </View>
  )
}

function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalsCard}>
      <Text style={styles.totalsLabel}>{label}</Text>
      <Text style={styles.totalsValue}>{value}</Text>
    </View>
  )
}

function Footer({ schoolName }: { schoolName: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>Generated by EduCore Africa</Text>
      <Text>Confidential · {schoolName}</Text>
    </View>
  )
}

// ─── Renderers ────────────────────────────────────────────────────

export async function renderClassReportPdf(data: ClassReportPdfInput): Promise<Buffer> {
  return await renderToBuffer(<ClassReportDocument data={data} />)
}

export async function renderStudentReportPdf(data: StudentReportPdfInput): Promise<Buffer> {
  return await renderToBuffer(<StudentReportDocument data={data} />)
}
