import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    color: "#0f172a",
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1pt solid #cbd5e1",
    paddingBottom: 12,
    marginBottom: 12,
  },
  schoolName: {
    fontSize: 18,
    fontWeight: 700,
    color: "#0D2B5E",
  },
  schoolMeta: {
    fontSize: 9,
    color: "#475569",
    marginTop: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 4,
  },
  periodLabel: {
    fontSize: 10,
    color: "#475569",
  },
  twoCol: {
    flexDirection: "row",
    marginBottom: 12,
    gap: 18,
  },
  section: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#64748b",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  label: {
    color: "#475569",
  },
  value: {
    fontWeight: 700,
  },
  table: {
    marginTop: 8,
    borderTop: "0.5pt solid #cbd5e1",
    borderBottom: "0.5pt solid #cbd5e1",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottom: "0.25pt solid #e2e8f0",
  },
  tableRowLast: {
    flexDirection: "row",
    paddingVertical: 4,
  },
  cellName: {
    flex: 2,
  },
  cellAmount: {
    flex: 1,
    textAlign: "right",
  },
  totalsBox: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  totalsInner: {
    width: 220,
  },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  netLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginTop: 4,
    borderTop: "1pt solid #0f172a",
    fontSize: 13,
    fontWeight: 700,
  },
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
  note: {
    marginTop: 12,
    padding: 8,
    backgroundColor: "#f1f5f9",
    fontSize: 9,
  },
})

export type PayslipPdfInput = {
  school: {
    name: string
    address?: string | null
    phone?: string | null
    email?: string | null
    logoUrl?: string | null
  }
  staff: {
    name: string
    staffNumber: string
    role: string
    department: string | null
    bankName: string | null
    accountNumber: string | null
    accountName: string | null
  }
  period: { name: string; startDate: string; endDate: string }
  basicSalary: number
  allowances: { name: string; amount: number }[]
  deductions: { name: string; amount: number }[]
  gross: number
  net: number
  paidAt: string | null
  note: string | null
  generatedAt: string
}

function money(n: number) {
  return `NGN ${n.toLocaleString()}`
}

function dateOnly(iso: string) {
  return new Date(iso).toISOString().slice(0, 10)
}

export function PayslipDocument({ data }: { data: PayslipPdfInput }) {
  const earnings = [
    { name: "Basic salary", amount: data.basicSalary },
    ...data.allowances,
  ]
  const totalDeductions = data.deductions.reduce((a, l) => a + l.amount, 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.schoolName}>{data.school.name}</Text>
            <Text style={styles.schoolMeta}>
              {[data.school.address, data.school.phone, data.school.email]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <Text style={styles.title}>Payslip</Text>
            <Text style={styles.periodLabel}>
              Period: {data.period.name} · {dateOnly(data.period.startDate)} to{" "}
              {dateOnly(data.period.endDate)}
            </Text>
          </View>
          <View>
            <Text style={[styles.label, { textAlign: "right" }]}>Issued</Text>
            <Text style={[styles.value, { textAlign: "right" }]}>
              {dateOnly(data.generatedAt)}
            </Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Employee</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Name</Text>
              <Text style={styles.value}>{data.staff.name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Staff no.</Text>
              <Text style={styles.value}>{data.staff.staffNumber}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Role</Text>
              <Text style={styles.value}>{data.staff.role.replace("_", " ")}</Text>
            </View>
            {data.staff.department && (
              <View style={styles.row}>
                <Text style={styles.label}>Department</Text>
                <Text style={styles.value}>{data.staff.department}</Text>
              </View>
            )}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bank</Text>
            {data.staff.bankName ? (
              <>
                <View style={styles.row}>
                  <Text style={styles.label}>Bank</Text>
                  <Text style={styles.value}>{data.staff.bankName}</Text>
                </View>
                {data.staff.accountNumber && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Account no.</Text>
                    <Text style={styles.value}>{data.staff.accountNumber}</Text>
                  </View>
                )}
                {data.staff.accountName && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Account name</Text>
                    <Text style={styles.value}>{data.staff.accountName}</Text>
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.label}>No bank on file.</Text>
            )}
            <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Status</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Paid</Text>
              <Text style={styles.value}>
                {data.paidAt ? dateOnly(data.paidAt) : "Pending"}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Earnings</Text>
        <View style={styles.table}>
          {earnings.map((l, i) => (
            <View
              key={`e-${i}`}
              style={i === earnings.length - 1 ? styles.tableRowLast : styles.tableRow}
            >
              <Text style={styles.cellName}>{l.name}</Text>
              <Text style={styles.cellAmount}>{money(l.amount)}</Text>
            </View>
          ))}
        </View>

        {data.deductions.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Deductions</Text>
            <View style={styles.table}>
              {data.deductions.map((l, i) => (
                <View
                  key={`d-${i}`}
                  style={i === data.deductions.length - 1 ? styles.tableRowLast : styles.tableRow}
                >
                  <Text style={styles.cellName}>{l.name}</Text>
                  <Text style={styles.cellAmount}>{money(l.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.totalsBox}>
          <View style={styles.totalsInner}>
            <View style={styles.totalLine}>
              <Text style={styles.label}>Gross</Text>
              <Text style={styles.value}>{money(data.gross)}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.label}>Total deductions</Text>
              <Text style={styles.value}>−{money(totalDeductions)}</Text>
            </View>
            <View style={styles.netLine}>
              <Text>Net pay</Text>
              <Text>{money(data.net)}</Text>
            </View>
          </View>
        </View>

        {data.note && (
          <View style={styles.note}>
            <Text>{data.note}</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>Generated by EduCore Africa</Text>
          <Text>Confidential · for {data.staff.name}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderPayslipPdf(data: PayslipPdfInput): Promise<Buffer> {
  return await renderToBuffer(<PayslipDocument data={data} />)
}
