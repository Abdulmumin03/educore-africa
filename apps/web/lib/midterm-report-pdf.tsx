import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"
import type { MidtermReportData } from "@/lib/midterm-report"
import {
  DEFAULT_MIDTERM_TEMPLATE,
  type MidtermSection,
  type ReportTemplateConfig,
} from "@/lib/report-template"

function buildStyles(t: ReportTemplateConfig) {
  return StyleSheet.create({
    page: {
      padding: 32,
      fontSize: 9.5,
      color: t.colors.bodyText,
      fontFamily: "Helvetica",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      borderBottom: `1pt solid ${t.colors.headerBorder}`,
      paddingBottom: 10,
      marginBottom: 10,
    },
    headerCentered: {
      alignItems: "center",
      borderBottom: `1pt solid ${t.colors.headerBorder}`,
      paddingBottom: 10,
      marginBottom: 10,
    },
    schoolBlock: { flex: 1 },
    schoolBlockCentered: { alignItems: "center" },
    schoolName: { fontSize: 16, fontWeight: 700, color: t.colors.primary },
    schoolMeta: { fontSize: 8.5, color: t.colors.mutedText },
    title: {
      fontSize: 12,
      fontWeight: 700,
      marginTop: 6,
      textTransform: "uppercase",
      letterSpacing: 1,
      color: t.colors.primary,
    },
    termInfo: { fontSize: 9, color: t.colors.mutedText },
    notice: {
      marginVertical: 8,
      padding: 6,
      backgroundColor: "#fef3c7",
      border: "0.5pt solid #fbbf24",
      fontSize: 8.5,
      color: "#78350f",
      borderRadius: 3,
    },
    studentRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 10,
      paddingBottom: 8,
      borderBottom: "0.5pt solid #e2e8f0",
    },
    studentBlock: { flex: 1 },
    studentName: { fontSize: 13, fontWeight: 700 },
    studentMeta: { fontSize: 9, color: t.colors.mutedText, marginTop: 1 },
    table: {
      marginTop: 6,
      borderTop: "0.5pt solid #94a3b8",
      borderBottom: "0.5pt solid #94a3b8",
    },
    trHead: {
      flexDirection: "row",
      paddingVertical: 4,
      backgroundColor: t.colors.accent,
      borderBottom: "0.5pt solid #94a3b8",
      fontWeight: 700,
    },
    tr: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.25pt solid #e2e8f0" },
    c_no: { width: 22, paddingLeft: 4 },
    c_subject: { flex: 2.2, paddingLeft: 4 },
    c_score: { flex: 0.8, textAlign: "right", paddingRight: 4 },
    c_total: { flex: 0.8, textAlign: "right", paddingRight: 4, fontWeight: 700 },
    c_remark: { flex: 2.2, fontSize: 8, color: t.colors.mutedText, paddingHorizontal: 4 },
    totalsRow: {
      marginTop: 8,
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 8,
    },
    totalsCard: {
      flex: 1,
      padding: 6,
      border: `0.5pt solid ${t.colors.totalsBorder}`,
      borderRadius: 3,
    },
    totalsLabel: { fontSize: 8, color: "#64748b", textTransform: "uppercase" },
    totalsValue: { fontSize: 14, fontWeight: 700, marginTop: 2 },
    commentBox: {
      marginTop: 10,
      border: `0.5pt solid ${t.colors.totalsBorder}`,
      padding: 8,
      borderRadius: 3,
    },
    commentLabel: {
      fontSize: 8.5,
      fontWeight: 700,
      textTransform: "uppercase",
      color: t.colors.mutedText,
    },
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
      color: t.colors.mutedText,
      textAlign: "center",
    },
    watermark: {
      position: "absolute",
      top: 340,
      left: 80,
      right: 80,
      textAlign: "center",
      fontSize: 56,
      color: t.colors.watermark ?? "#fee2c2",
      opacity: 0.55,
      fontWeight: 700,
      transform: "rotate(-22deg)",
      letterSpacing: 6,
    },
    footer: {
      position: "absolute",
      bottom: 22,
      left: 32,
      right: 32,
      fontSize: 7.5,
      color: "#94a3b8",
      borderTop: `0.5pt solid ${t.colors.headerBorder}`,
      paddingTop: 6,
      flexDirection: "row",
      justifyContent: "space-between",
    },
  })
}

function termLabel(t: MidtermReportData["term"]) {
  const type = t.type[0] + t.type.slice(1).toLowerCase()
  return `${type} term · ${t.sessionName}`
}

export function MidtermReportDocument({
  data,
  template = DEFAULT_MIDTERM_TEMPLATE,
}: {
  data: MidtermReportData
  template?: ReportTemplateConfig
}) {
  const t = template
  const styles = buildStyles(t)
  const fullName = [data.student.firstName, data.student.middleName, data.student.lastName]
    .filter(Boolean)
    .join(" ")

  const hasComponents = data.midtermComponents.length > 0
  // Adapt the per-component column flex so wide rosters still fit. 4+ components
  // get the smallest cell; 1–3 keeps a comfortable 0.8.
  const compFlex = data.midtermComponents.length >= 4 ? 0.6 : 0.8

  const title = t.header.titleOverride || "Midterm report — not final"
  const watermarkText = t.customText.watermark ?? "MIDTERM"
  const sections = t.sections as MidtermSection[]

  const renderSection = (sec: MidtermSection) => {
    switch (sec) {
      case "student-info":
        return (
          <View key="student-info" style={styles.studentRow}>
            <View style={styles.studentBlock}>
              <Text style={styles.studentName}>{fullName}</Text>
              <Text style={styles.studentMeta}>
                Admission no.: {data.student.admissionNumber}
                {" · "}Class: {data.student.className} · Arm {data.student.sectionName}
                {data.curriculum.code ? ` · ${data.curriculum.code}` : ""}
              </Text>
            </View>
          </View>
        )

      case "subjects-table":
        return (
          <View key="subjects-table">
            {!hasComponents ? (
              <View style={styles.notice}>
                <Text>
                  This curriculum has no midterm components configured. Set them in
                  Settings → Curricula to populate this report.
                </Text>
              </View>
            ) : (
              <View style={styles.table}>
                <View style={styles.trHead}>
                  <Text style={styles.c_no}>#</Text>
                  <Text style={styles.c_subject}>Subject</Text>
                  {data.midtermComponents.map((c) => (
                    <Text key={c} style={[styles.c_score, { flex: compFlex }]}>
                      {c}
                    </Text>
                  ))}
                  <Text style={styles.c_total}>Total</Text>
                  <Text style={styles.c_remark}>Remark</Text>
                </View>
                {data.subjects.length === 0 ? (
                  <View style={styles.tr}>
                    <Text style={[styles.c_subject, { color: "#94a3b8" }]}>
                      No grades recorded for this term yet.
                    </Text>
                  </View>
                ) : (
                  data.subjects.map((s, i) => (
                    <View key={s.id} style={styles.tr}>
                      <Text style={styles.c_no}>{i + 1}</Text>
                      <Text style={styles.c_subject}>
                        {s.name}
                        {s.externalCode ? `  (${s.externalCode})` : ""}
                      </Text>
                      {data.midtermComponents.map((c) => (
                        <Text key={c} style={[styles.c_score, { flex: compFlex }]}>
                          {s.components[c] === null
                            ? "—"
                            : (s.components[c] as number).toFixed(1)}
                        </Text>
                      ))}
                      <Text style={styles.c_total}>{s.midtermTotal.toFixed(1)}</Text>
                      <Text style={styles.c_remark}>{s.teacherRemark ?? ""}</Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )

      case "totals":
        return (
          <View key="totals" style={styles.totalsRow}>
            <View style={styles.totalsCard}>
              <Text style={styles.totalsLabel}>Subjects</Text>
              <Text style={styles.totalsValue}>{data.totals.subjectCount}</Text>
            </View>
            <View style={styles.totalsCard}>
              <Text style={styles.totalsLabel}>Midterm total</Text>
              <Text style={styles.totalsValue}>{data.totals.total.toFixed(1)}</Text>
            </View>
            <View style={styles.totalsCard}>
              <Text style={styles.totalsLabel}>Average</Text>
              <Text style={styles.totalsValue}>{data.totals.average.toFixed(1)}</Text>
            </View>
            <View style={styles.totalsCard}>
              <Text style={styles.totalsLabel}>Attendance</Text>
              <Text style={styles.totalsValue}>
                {data.attendance.percent === null ? "—" : `${data.attendance.percent}%`}
              </Text>
            </View>
          </View>
        )

      case "class-teacher-comment":
        return data.classTeacherComment ? (
          <View key="class-teacher-comment" style={styles.commentBox}>
            <Text style={styles.commentLabel}>Class teacher</Text>
            <Text style={styles.commentText}>{data.classTeacherComment}</Text>
          </View>
        ) : null

      case "principal-comment":
        return data.principalComment ? (
          <View key="principal-comment" style={styles.commentBox}>
            <Text style={styles.commentLabel}>
              Principal {data.aiPrincipal ? "· AI-assisted" : ""}
            </Text>
            <Text style={styles.commentText}>{data.principalComment}</Text>
          </View>
        ) : null

      case "signatures":
        return (
          <View key="signatures" style={styles.stampRow}>
            {t.signatures.map((sig, i) => (
              <View key={i} style={styles.stampBox}>
                <Text>{sig.label}</Text>
              </View>
            ))}
          </View>
        )
    }
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.watermark} fixed>
          {watermarkText}
        </Text>

        {t.header.layout === "centered" ? (
          <View style={styles.headerCentered}>
            <View style={styles.schoolBlockCentered}>
              <Text style={styles.schoolName}>{data.school.name}</Text>
              <Text style={styles.schoolMeta}>
                {[data.school.address, data.school.phone, data.school.email]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {t.header.showMotto && data.school.motto && (
                <Text style={[styles.schoolMeta, { fontStyle: "italic", marginTop: 2 }]}>
                  {data.school.motto}
                </Text>
              )}
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.termInfo}>{termLabel(data.term)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.header}>
            <View style={styles.schoolBlock}>
              <Text style={styles.schoolName}>{data.school.name}</Text>
              <Text style={styles.schoolMeta}>
                {[data.school.address, data.school.phone, data.school.email]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {t.header.showMotto && data.school.motto && (
                <Text style={[styles.schoolMeta, { fontStyle: "italic", marginTop: 2 }]}>
                  {data.school.motto}
                </Text>
              )}
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.termInfo}>{termLabel(data.term)}</Text>
            </View>
            <View>
              <Text style={[styles.schoolMeta, { textAlign: "right" }]}>Issued</Text>
              <Text style={[styles.studentMeta, { textAlign: "right", fontWeight: 700 }]}>
                {new Date().toISOString().slice(0, 10)}
              </Text>
            </View>
          </View>
        )}

        {sections.map(renderSection)}

        <View style={styles.footer} fixed>
          <Text>Midterm report · {data.school.name}</Text>
          <Text>{t.customText.footer ?? "Generated by EduCore Africa"}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderMidtermReportPdf(
  data: MidtermReportData,
  template?: ReportTemplateConfig,
): Promise<Buffer> {
  return await renderToBuffer(<MidtermReportDocument data={data} template={template} />)
}
