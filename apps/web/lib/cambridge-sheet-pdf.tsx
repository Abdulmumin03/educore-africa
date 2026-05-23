import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"
import type { ReportCardData } from "@/lib/report-card"
import type { ResolvedCurriculum } from "@/lib/curriculum"
import { letterGradeFor } from "@/lib/grade-config"

export type CambridgeSheetInput = {
  data: ReportCardData
  curriculum: ResolvedCurriculum
  externalCodeBySubjectId: Record<string, string | null>
}

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
  title: { fontSize: 14, fontWeight: 700, marginTop: 6, color: "#1e3a8a" },
  subtitle: { fontSize: 9, color: "#475569" },
  notice: {
    marginVertical: 10,
    padding: 8,
    backgroundColor: "#dbeafe",
    border: "0.5pt solid #60a5fa",
    fontSize: 9,
    color: "#1e3a8a",
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
    backgroundColor: "#e0e7ff",
    borderBottom: "0.5pt solid #94a3b8",
    fontWeight: 700,
  },
  tr: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.25pt solid #e2e8f0" },
  c_no: { width: 24, paddingLeft: 4 },
  c_subject: { flex: 2.5, paddingLeft: 4 },
  c_code: { flex: 1, color: "#475569" },
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
  candidateBlock: {
    marginTop: 4,
    flexDirection: "row",
    gap: 12,
  },
  candidateLabel: { color: "#475569", fontSize: 9 },
  candidateValue: { fontWeight: 700, fontSize: 9 },
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

function dateOnly(iso: string) {
  return new Date(iso).toISOString().slice(0, 10)
}

// A Cambridge "pass" at IGCSE is C or above; A-Level is E or above. We use
// a generic threshold of >= 5 scale points which captures both for the
// preset scales we ship.
function isPass(grade: string | null | undefined, scale: ReturnType<typeof letterGradeFor> | null): boolean {
  if (!grade) return false
  if (grade === "U" || grade === "F" || grade === "G") return false
  return true
}

export function CambridgeSheetDocument({
  data,
  curriculum,
  externalCodeBySubjectId,
}: CambridgeSheetInput) {
  const fullName = [data.student.firstName, data.student.middleName, data.student.lastName]
    .filter(Boolean)
    .join(" ")

  const scale = curriculum.gradingScale.scale

  const rows = data.subjects.map((s) => {
    const lg = letterGradeFor(s.total, scale)
    return {
      ...s,
      cambridgeGrade: lg?.grade ?? null,
      remark: lg?.remark ?? null,
      cambridgeCode: externalCodeBySubjectId[s.id] ?? null,
    }
  })

  const passing = rows.filter((r) => isPass(r.cambridgeGrade, null)).length

  const sheetTitle =
    curriculum.examBodyCode === "CAMBRIDGE"
      ? curriculum.code === "ALEVEL"
        ? "Mock Cambridge A-Level sheet"
        : "Mock Cambridge IGCSE / Checkpoint sheet"
      : `Mock ${curriculum.name} sheet`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.schoolName}>{data.school.name}</Text>
            <Text style={styles.schoolMeta}>
              {[data.school.address, data.school.phone, data.school.email].filter(Boolean).join(" · ")}
            </Text>
            <Text style={styles.title}>{sheetTitle}</Text>
            <Text style={styles.subtitle}>
              {data.term.sessionName} · {data.term.type[0] + data.term.type.slice(1).toLowerCase()} term · {curriculum.name}
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
            This is a MOCK summary projecting performance under the {curriculum.name} grading scheme.
            It is not an official Cambridge result and may not be used for university admissions.
          </Text>
        </View>

        <View style={styles.studentBlock}>
          <Text style={styles.studentName}>{fullName}</Text>
          <Text style={styles.studentMeta}>
            Admission no.: {data.student.admissionNumber}
            {" · "}Class: {data.student.className} · Arm {data.student.sectionName}
          </Text>
          <View style={styles.candidateBlock}>
            <Text style={styles.candidateLabel}>Candidate number</Text>
            <Text style={styles.candidateValue}>—</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={styles.c_no}>#</Text>
            <Text style={styles.c_subject}>Subject</Text>
            <Text style={styles.c_code}>Syllabus</Text>
            <Text style={styles.c_score}>Score</Text>
            <Text style={styles.c_grade}>Grade</Text>
            <Text style={styles.c_interp}>Interpretation</Text>
          </View>
          {rows.length === 0 ? (
            <View style={styles.tr}>
              <Text style={[styles.c_subject, { color: "#94a3b8" }]}>
                No grades recorded for this term.
              </Text>
            </View>
          ) : (
            rows.map((s, i) => (
              <View key={s.id} style={styles.tr}>
                <Text style={styles.c_no}>{i + 1}</Text>
                <Text style={styles.c_subject}>{s.name}</Text>
                <Text style={styles.c_code}>{s.cambridgeCode ?? "—"}</Text>
                <Text style={styles.c_score}>{s.total.toFixed(1)}</Text>
                <Text
                  style={[
                    styles.c_grade,
                    {
                      color:
                        s.cambridgeGrade === "U"
                          ? "#b91c1c"
                          : isPass(s.cambridgeGrade, null)
                            ? "#0f766e"
                            : "#a16207",
                    },
                  ]}
                >
                  {s.cambridgeGrade ?? "—"}
                </Text>
                <Text style={styles.c_interp}>{s.remark ?? "—"}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subjects sat</Text>
            <Text style={styles.summaryValue}>{rows.length}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Passing grades</Text>
            <Text
              style={[
                styles.summaryValue,
                { color: passing >= 5 ? "#0f766e" : "#a16207" },
              ]}
            >
              {passing} {passing >= 5 ? "✓ minimum met" : "· below 5"}
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
          <Text>Mock Cambridge projection · {data.school.name}</Text>
          <Text>Generated by EduCore Africa</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderCambridgeSheetPdf(input: CambridgeSheetInput): Promise<Buffer> {
  return await renderToBuffer(<CambridgeSheetDocument {...input} />)
}
