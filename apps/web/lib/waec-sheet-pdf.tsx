import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"
import type { ReportCardData } from "@/lib/report-card"

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
  schoolMeta: { fontSize: 9, color: "#475569", marginTop: 1 },
  title: { fontSize: 14, fontWeight: 700, marginTop: 6, color: "#7c2d12" },
  subtitle: { fontSize: 9, color: "#475569" },
  notice: {
    marginVertical: 10,
    padding: 8,
    backgroundColor: "#fef3c7",
    border: "0.5pt solid #fbbf24",
    fontSize: 9,
    color: "#78350f",
  },
  studentBlock: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: "0.5pt solid #e2e8f0",
  },
  studentName: { fontSize: 12, fontWeight: 700 },
  studentMeta: { fontSize: 9, color: "#475569", marginTop: 1 },
  table: {
    marginTop: 6,
    borderTop: "0.5pt solid #94a3b8",
    borderBottom: "0.5pt solid #94a3b8",
  },
  trHead: {
    flexDirection: "row",
    paddingVertical: 4,
    backgroundColor: "#f1f5f9",
    borderBottom: "0.5pt solid #94a3b8",
    fontWeight: 700,
  },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.25pt solid #e2e8f0" },
  c_no: { width: 24, paddingLeft: 4 },
  c_subject: { flex: 2.5, paddingLeft: 4 },
  c_waec: { flex: 1, fontFamily: "Helvetica", color: "#475569" },
  c_score: { flex: 0.8, textAlign: "right", paddingRight: 4 },
  c_grade: { flex: 0.7, textAlign: "center", fontWeight: 700 },
  c_interp: { flex: 1.8, fontSize: 8.5, color: "#475569", paddingHorizontal: 4 },
  summary: {
    marginTop: 14,
    padding: 10,
    border: "0.5pt solid #cbd5e1",
    borderRadius: 3,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  summaryLabel: { color: "#475569" },
  summaryValue: { fontWeight: 700 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7.5,
    color: "#94a3b8",
    borderTop: "0.5pt solid #cbd5e1",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
})

// WAEC interpretation map — derived from the WAEC SSCE grading scheme.
const WAEC_INTERP: Record<string, { label: string; pass: boolean }> = {
  A1: { label: "Excellent", pass: true },
  B2: { label: "Very Good", pass: true },
  B3: { label: "Good", pass: true },
  C4: { label: "Credit", pass: true },
  C5: { label: "Credit", pass: true },
  C6: { label: "Credit", pass: true },
  D7: { label: "Pass", pass: false }, // Not a Credit at WAEC level
  E8: { label: "Pass", pass: false },
  F9: { label: "Fail", pass: false },
}

function dateOnly(iso: string) {
  return new Date(iso).toISOString().slice(0, 10)
}

export function WaecSheetDocument({ data }: { data: ReportCardData }) {
  const fullName = [data.student.firstName, data.student.middleName, data.student.lastName]
    .filter(Boolean)
    .join(" ")

  // Count credits (A1–C6 = 1–6 on WAEC's points scale).
  const credits = data.subjects.filter((s) => {
    if (!s.waecGrade) return false
    const meta = WAEC_INTERP[s.waecGrade]
    return meta?.pass ?? false
  }).length

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.schoolName}>{data.school.name}</Text>
            <Text style={styles.schoolMeta}>
              {[data.school.address, data.school.phone, data.school.email].filter(Boolean).join(" · ")}
            </Text>
            <Text style={styles.title}>Mock WAEC / NECO summary sheet</Text>
            <Text style={styles.subtitle}>
              {data.term.sessionName} · {data.term.type[0] + data.term.type.slice(1).toLowerCase()} term
            </Text>
          </View>
          <View>
            <Text style={[styles.schoolMeta, { textAlign: "right" }]}>Issued</Text>
            <Text style={[styles.title, { fontSize: 10, textAlign: "right", color: "#0f172a" }]}>
              {dateOnly(new Date().toISOString())}
            </Text>
          </View>
        </View>

        <View style={styles.notice}>
          <Text>
            This is a MOCK summary projecting performance under the WAEC SSCE grading scheme. It is
            not an official WAEC result and may not be used for university admissions.
          </Text>
        </View>

        <View style={styles.studentBlock}>
          <Text style={styles.studentName}>{fullName}</Text>
          <Text style={styles.studentMeta}>
            Admission no.: {data.student.admissionNumber}
            {" · "}Class: {data.student.className} · Arm {data.student.sectionName}
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={styles.c_no}>#</Text>
            <Text style={styles.c_subject}>Subject</Text>
            <Text style={styles.c_waec}>WAEC code</Text>
            <Text style={styles.c_score}>Score</Text>
            <Text style={styles.c_grade}>Grade</Text>
            <Text style={styles.c_interp}>Interpretation</Text>
          </View>
          {data.subjects.length === 0 ? (
            <View style={styles.tr}>
              <Text style={[styles.c_subject, { color: "#94a3b8" }]}>
                No grades recorded for this term.
              </Text>
            </View>
          ) : (
            data.subjects.map((s, i) => {
              const meta = s.waecGrade ? WAEC_INTERP[s.waecGrade] : null
              return (
                <View key={s.id} style={styles.tr}>
                  <Text style={styles.c_no}>{i + 1}</Text>
                  <Text style={styles.c_subject}>{s.name}</Text>
                  <Text style={styles.c_waec}>{s.waecCode ?? "—"}</Text>
                  <Text style={styles.c_score}>{s.total.toFixed(1)}</Text>
                  <Text
                    style={[
                      styles.c_grade,
                      {
                        color:
                          s.waecGrade === "F9"
                            ? "#b91c1c"
                            : meta?.pass
                              ? "#0f766e"
                              : "#a16207",
                      },
                    ]}
                  >
                    {s.waecGrade ?? "—"}
                  </Text>
                  <Text style={styles.c_interp}>{meta?.label ?? "—"}</Text>
                </View>
              )
            })
          )}
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subjects sat</Text>
            <Text style={styles.summaryValue}>{data.subjects.length}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Credits (A1–C6)</Text>
            <Text style={[styles.summaryValue, { color: credits >= 5 ? "#0f766e" : "#a16207" }]}>
              {credits} {credits >= 5 ? "✓ minimum met" : "· below 5"}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Average %</Text>
            <Text style={styles.summaryValue}>{data.totals.average.toFixed(1)}%</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Class position</Text>
            <Text style={styles.summaryValue}>
              {data.totals.overallPosition ?? "—"}
              {data.totals.positionOutOf > 0 ? ` / ${data.totals.positionOutOf}` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>Mock WAEC/NECO projection · {data.school.name}</Text>
          <Text>Generated by EduCore Africa</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderWaecSheetPdf(data: ReportCardData): Promise<Buffer> {
  return await renderToBuffer(<WaecSheetDocument data={data} />)
}
