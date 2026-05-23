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
  page: { padding: 32, fontSize: 9.5, color: "#0f172a", fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1pt solid #cbd5e1",
    paddingBottom: 10,
    marginBottom: 10,
  },
  schoolBlock: { flex: 1 },
  schoolName: { fontSize: 16, fontWeight: 700, color: "#0D2B5E" },
  schoolMeta: { fontSize: 8.5, color: "#475569" },
  title: { fontSize: 12, fontWeight: 700, marginTop: 6, textTransform: "uppercase", letterSpacing: 1 },
  termInfo: { fontSize: 9, color: "#475569" },
  studentRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottom: "0.5pt solid #e2e8f0",
  },
  studentBlock: { flex: 1 },
  studentName: { fontSize: 13, fontWeight: 700 },
  studentMeta: { fontSize: 9, color: "#475569", marginTop: 1 },
  twoCol: { flexDirection: "row", gap: 12 },
  metaCol: { flex: 1 },
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
  c_subject: { flex: 2, paddingLeft: 4 },
  c_num: { flex: 0.7, textAlign: "right", paddingRight: 4 },
  c_grade: { flex: 0.7, textAlign: "center" },
  c_remark: { flex: 2.5, fontSize: 8, color: "#475569", paddingHorizontal: 4 },
  c_pos: { flex: 0.6, textAlign: "center" },
  totalsRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  totalsCard: {
    flex: 1,
    padding: 6,
    border: "0.5pt solid #cbd5e1",
    borderRadius: 3,
  },
  totalsLabel: { fontSize: 8, color: "#64748b", textTransform: "uppercase" },
  totalsValue: { fontSize: 14, fontWeight: 700, marginTop: 2 },
  commentBox: {
    marginTop: 10,
    border: "0.5pt solid #cbd5e1",
    padding: 8,
    borderRadius: 3,
  },
  commentLabel: { fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", color: "#475569" },
  commentText: { marginTop: 3, fontSize: 9.5, lineHeight: 1.35 },
  stampRow: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 24,
  },
  stampBox: {
    flex: 1,
    paddingTop: 24,
    borderTop: "0.5pt solid #94a3b8",
    fontSize: 8,
    color: "#475569",
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTop: "0.5pt solid #cbd5e1",
    fontSize: 8,
    color: "#94a3b8",
  },
})

function dateOnly(iso: string) {
  return new Date(iso).toISOString().slice(0, 10)
}

export function ReportCardDocument({ data }: { data: ReportCardData }) {
  const fullName = [data.student.firstName, data.student.middleName, data.student.lastName]
    .filter(Boolean)
    .join(" ")

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.schoolBlock}>
            <Text style={styles.schoolName}>{data.school.name}</Text>
            {data.school.motto && (
              <Text style={[styles.schoolMeta, { fontStyle: "italic" }]}>{data.school.motto}</Text>
            )}
            <Text style={styles.schoolMeta}>
              {[data.school.address, data.school.phone, data.school.email].filter(Boolean).join(" · ")}
            </Text>
            <Text style={styles.title}>Student report card</Text>
            <Text style={styles.termInfo}>
              {data.term.sessionName} · {data.term.type[0] + data.term.type.slice(1).toLowerCase()} term
            </Text>
          </View>
          <View>
            <Text style={[styles.schoolMeta, { textAlign: "right" }]}>Issued</Text>
            <Text style={[styles.title, { fontSize: 10, textAlign: "right" }]}>
              {dateOnly(new Date().toISOString())}
            </Text>
          </View>
        </View>

        <View style={styles.studentRow}>
          <View style={styles.studentBlock}>
            <Text style={styles.studentName}>{fullName}</Text>
            <Text style={styles.studentMeta}>
              Admission no.: {data.student.admissionNumber}
              {data.student.dateOfBirth ? ` · DOB: ${dateOnly(data.student.dateOfBirth)}` : ""}
            </Text>
            <Text style={styles.studentMeta}>
              Class: {data.student.className} · Arm {data.student.sectionName}
            </Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.studentMeta}>
              School days: {data.attendance.schoolDays}
            </Text>
            <Text style={styles.studentMeta}>
              Present: {data.attendance.present + data.attendance.late}
              {data.attendance.percent !== null ? `  (${data.attendance.percent}%)` : ""}
            </Text>
            <Text style={styles.studentMeta}>
              Absent: {data.attendance.absent} · Excused: {data.attendance.excused}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={styles.c_subject}>Subject</Text>
            <Text style={styles.c_num}>CA</Text>
            <Text style={styles.c_num}>Exam</Text>
            <Text style={styles.c_num}>Total</Text>
            <Text style={styles.c_grade}>Grade</Text>
            <Text style={styles.c_pos}>Pos.</Text>
            <Text style={styles.c_remark}>Remark</Text>
          </View>
          {data.subjects.map((s) => (
            <View key={s.id} style={styles.tr}>
              <Text style={styles.c_subject}>
                {s.name}
                {s.externalCode ? `  (${s.externalCode})` : ""}
              </Text>
              <Text style={styles.c_num}>{s.ca.toFixed(1)}</Text>
              <Text style={styles.c_num}>{s.exam.toFixed(1)}</Text>
              <Text style={[styles.c_num, { fontWeight: 700 }]}>{s.total.toFixed(1)}</Text>
              <Text style={styles.c_grade}>{s.letterGrade ?? "—"}</Text>
              <Text style={styles.c_pos}>{s.position ?? "—"}</Text>
              <Text style={styles.c_remark}>{s.teacherRemark ?? ""}</Text>
            </View>
          ))}
          {data.subjects.length === 0 && (
            <View style={styles.tr}>
              <Text style={[styles.c_subject, { color: "#94a3b8" }]}>
                No grades recorded for this term.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.totalsRow}>
          <View style={styles.totalsCard}>
            <Text style={styles.totalsLabel}>Overall total</Text>
            <Text style={styles.totalsValue}>{data.totals.total.toFixed(1)}</Text>
          </View>
          <View style={styles.totalsCard}>
            <Text style={styles.totalsLabel}>Average %</Text>
            <Text style={styles.totalsValue}>{data.totals.average.toFixed(1)}%</Text>
          </View>
          <View style={styles.totalsCard}>
            <Text style={styles.totalsLabel}>Class position</Text>
            <Text style={styles.totalsValue}>
              {data.totals.overallPosition ?? "—"}
              {data.totals.positionOutOf > 0 ? ` / ${data.totals.positionOutOf}` : ""}
            </Text>
          </View>
        </View>

        {data.classTeacherComment && (
          <View style={styles.commentBox}>
            <Text style={styles.commentLabel}>Class teacher</Text>
            <Text style={styles.commentText}>{data.classTeacherComment}</Text>
          </View>
        )}
        {data.principalComment && (
          <View style={styles.commentBox}>
            <Text style={styles.commentLabel}>
              Principal{data.aiPrincipal ? " · AI-assisted draft" : ""}
            </Text>
            <Text style={styles.commentText}>{data.principalComment}</Text>
          </View>
        )}

        <View style={styles.stampRow}>
          <View style={styles.stampBox}>
            <Text>Class teacher signature</Text>
          </View>
          <View style={styles.stampBox}>
            <Text>Principal signature &amp; school stamp</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {data.nextTermBegins
              ? `Next term begins ${dateOnly(data.nextTermBegins)}`
              : "Next term TBC"}
            {data.schoolFees !== null
              ? ` · School fees: NGN ${data.schoolFees.toLocaleString()}`
              : ""}
          </Text>
          <Text>Generated by EduCore Africa</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderReportCardPdf(data: ReportCardData): Promise<Buffer> {
  return await renderToBuffer(<ReportCardDocument data={data} />)
}
