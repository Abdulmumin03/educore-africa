import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#0f172a", fontFamily: "Helvetica" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1pt solid #cbd5e1",
    paddingBottom: 10,
    marginBottom: 14,
  },
  schoolName: { fontSize: 16, fontWeight: 700, color: "#0D2B5E" },
  schoolMeta: { fontSize: 8.5, color: "#475569" },
  receiptLabel: {
    fontSize: 14,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#0D2B5E",
  },
  refNo: { fontSize: 11, marginTop: 2, color: "#475569" },
  paidStamp: {
    marginTop: 6,
    padding: "4 8",
    border: "1pt solid #10b981",
    color: "#047857",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
  },
  twoCol: { flexDirection: "row", gap: 16, marginBottom: 16 },
  col: { flex: 1 },
  sectionLabel: { fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  rowLabel: { color: "#475569" },
  rowValue: { fontWeight: 700 },
  amountBox: {
    marginVertical: 14,
    padding: 16,
    borderTop: "1pt solid #0f172a",
    borderBottom: "1pt solid #0f172a",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountLabel: { fontSize: 11, color: "#475569" },
  amountValue: { fontSize: 22, fontWeight: 700 },
  amountWords: {
    marginTop: 4,
    fontSize: 9,
    fontStyle: "italic",
    color: "#475569",
  },
  notes: {
    marginTop: 14,
    padding: 8,
    backgroundColor: "#f1f5f9",
    fontSize: 9,
  },
  stampRow: {
    marginTop: 24,
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

export type ReceiptPdfInput = {
  school: {
    name: string
    address?: string | null
    phone?: string | null
    email?: string | null
    motto?: string | null
  }
  student: {
    name: string
    admissionNumber: string
    className: string | null
    sectionName: string | null
  }
  invoice: {
    no: string
    termLabel: string
    amountDue: number
    amountPaid: number
    balanceAfter: number
  }
  payment: {
    reference: string
    amount: number
    channel: string
    paidAt: string
    payerName: string | null
    payerPhone: string | null
    notes: string | null
  }
}

function dateOnly(iso: string) {
  return new Date(iso).toISOString().slice(0, 10)
}

function money(n: number) {
  return `NGN ${n.toLocaleString()}`
}

// Convert a number under 1,000,000 to words. Good enough for school fees.
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

function under1000(n: number): string {
  if (n === 0) return ""
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`)
  if (rest >= 20) {
    const tens = Math.floor(rest / 10)
    const ones = rest % 10
    parts.push(ones ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens])
  } else if (rest >= 10) parts.push(TEENS[rest - 10])
  else if (rest > 0) parts.push(ONES[rest])
  return parts.join(" ")
}

function amountInWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return ""
  const naira = Math.floor(n)
  const kobo = Math.round((n - naira) * 100)
  let nairaWords = ""
  if (naira === 0) nairaWords = "zero naira"
  else {
    const millions = Math.floor(naira / 1_000_000)
    const thousands = Math.floor((naira % 1_000_000) / 1000)
    const remainder = naira % 1000
    const parts: string[] = []
    if (millions) parts.push(`${under1000(millions)} million`)
    if (thousands) parts.push(`${under1000(thousands)} thousand`)
    if (remainder) parts.push(under1000(remainder))
    nairaWords = `${parts.join(" ")} naira`
  }
  const koboWords = kobo > 0 ? ` and ${under1000(kobo)} kobo` : ""
  return (nairaWords + koboWords).replace(/\s+/g, " ").trim() + " only"
}

export function ReceiptDocument({ data }: { data: ReceiptPdfInput }) {
  return (
    <Document>
      <Page size="A5" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.schoolName}>{data.school.name}</Text>
            {data.school.motto && (
              <Text style={[styles.schoolMeta, { fontStyle: "italic" }]}>{data.school.motto}</Text>
            )}
            <Text style={styles.schoolMeta}>
              {[data.school.address, data.school.phone, data.school.email].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <View>
            <Text style={[styles.receiptLabel, { textAlign: "right" }]}>Receipt</Text>
            <Text style={[styles.refNo, { textAlign: "right" }]}>{data.payment.reference}</Text>
            <Text style={styles.paidStamp}>Paid</Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Received from</Text>
            <Text style={{ fontWeight: 700, fontSize: 11 }}>{data.student.name}</Text>
            <Text style={styles.schoolMeta}>Admission no.: {data.student.admissionNumber}</Text>
            {data.student.className && (
              <Text style={styles.schoolMeta}>
                {data.student.className}
                {data.student.sectionName ? ` · Arm ${data.student.sectionName}` : ""}
              </Text>
            )}
            {data.payment.payerName && (
              <Text style={[styles.schoolMeta, { marginTop: 4 }]}>
                Payer: {data.payment.payerName}
                {data.payment.payerPhone ? ` (${data.payment.payerPhone})` : ""}
              </Text>
            )}
          </View>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Payment details</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Invoice</Text>
              <Text style={styles.rowValue}>{data.invoice.no}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Term</Text>
              <Text style={styles.rowValue}>{data.invoice.termLabel}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Channel</Text>
              <Text style={styles.rowValue}>{data.payment.channel.replace("_", " ")}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Paid on</Text>
              <Text style={styles.rowValue}>{dateOnly(data.payment.paidAt)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>Amount received</Text>
          <Text style={styles.amountValue}>{money(data.payment.amount)}</Text>
        </View>
        <Text style={styles.amountWords}>In words: {amountInWords(data.payment.amount)}.</Text>

        <View style={[styles.twoCol, { marginTop: 12 }]}>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>Invoice status</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Invoice total</Text>
              <Text style={styles.rowValue}>{money(data.invoice.amountDue)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Total paid (incl. this)</Text>
              <Text style={styles.rowValue}>{money(data.invoice.amountPaid)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Balance remaining</Text>
              <Text style={[styles.rowValue, { color: data.invoice.balanceAfter > 0 ? "#a16207" : "#047857" }]}>
                {money(data.invoice.balanceAfter)}
              </Text>
            </View>
          </View>
          <View style={styles.col}>
            {data.payment.notes && (
              <View style={styles.notes}>
                <Text style={styles.sectionLabel}>Notes</Text>
                <Text>{data.payment.notes}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.stampRow}>
          <View style={styles.stampBox}>
            <Text>Received by · signature</Text>
          </View>
          <View style={styles.stampBox}>
            <Text>School stamp</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>{data.school.name}</Text>
          <Text>Generated by EduCore Africa · {dateOnly(new Date().toISOString())}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderReceiptPdf(data: ReceiptPdfInput): Promise<Buffer> {
  return await renderToBuffer(<ReceiptDocument data={data} />)
}
